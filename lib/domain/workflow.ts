import {
  sql,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  inArray,
  or,
} from "drizzle-orm";
import { z } from "zod";
import {
  activities,
  auditEvents,
  companies,
  contacts,
  deals,
  leads,
  leadSources,
  opportunityProducts,
  products,
} from "../db/schema";
import { AccessDenied, visibilityScope } from "../access/policy";
import { idSchema, type Kind } from "../validation";
import { tables, pageNumber } from "./crm";
import { workspaceService, writeAudit, type Actor } from "./workspace";
import type { Database } from "./database";
const conversionInput = z.object({
  leadId: idSchema,
  contactId: z.union([idSchema, z.literal("")]).optional(),
  companyId: z.union([idSchema, z.literal("")]).optional(),
  createCompany: z.boolean().default(true),
  createOpportunity: z.boolean().default(true),
  opportunityName: z.string().trim().max(160).default(""),
});
const configurationInput = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).default(""),
  price: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .default("0")
    .transform((v) => Math.round(Number(v) * 100)),
});
export function workflowService(db: Database) {
  const access = workspaceService(db);
  async function configuration(
    actor: Actor,
    org: string,
    pageInput: unknown = 1,
    search = "",
  ) {
    return access.within(actor, org, "view", async (tx) => {
      const page = pageNumber(pageInput);
      const pattern = `%${search.slice(0, 160).replace(/[\\%_]/g, "\\$&")}%`;
      const pf = and(
        eq(products.organizationId, org),
        isNull(products.deletedAt),
        ilike(products.name, pattern),
      );
      const sf = and(
        eq(leadSources.organizationId, org),
        isNull(leadSources.deletedAt),
        ilike(leadSources.name, pattern),
      );
      const p = await tx
        .select()
        .from(products)
        .where(pf)
        .orderBy(asc(products.name), asc(products.id))
        .limit(50)
        .offset((page - 1) * 50);
      const s = await tx
        .select()
        .from(leadSources)
        .where(sf)
        .orderBy(asc(leadSources.name), asc(leadSources.id))
        .limit(50)
        .offset((page - 1) * 50);
      const pc = await tx.select({ total: count() }).from(products).where(pf);
      const sc = await tx
        .select({ total: count() })
        .from(leadSources)
        .where(sf);
      return {
        products: p,
        sources: s,
        page,
        total: Math.max(pc[0].total, sc[0].total),
      };
    });
  }
  async function configure(
    actor: Actor,
    org: string,
    kind: "products" | "sources",
    input: unknown,
    id?: string,
    archive = false,
  ) {
    if (id) idSchema.parse(id);
    const parsed = configurationInput.parse(input);
    return access.within(actor, org, "configure", async (tx) => {
      const table = kind === "products" ? products : leadSources;
      const [before] = id
        ? await tx
            .select()
            .from(table)
            .where(
              and(
                eq(table.organizationId, org),
                eq(table.id, id),
                isNull(table.deletedAt),
              ),
            )
        : [];
      if (id && !before) throw new AccessDenied("Configuration unavailable.");
      const values = {
        name: parsed.name,
        updatedAt: new Date(),
        ...(kind === "products"
          ? { sku: parsed.sku, price: parsed.price }
          : {}),
        ...(archive ? { deletedAt: new Date() } : {}),
      };
      const [after] = id
        ? await tx
            .update(table)
            .set(values)
            .where(and(eq(table.organizationId, org), eq(table.id, id)))
            .returning()
        : await tx
            .insert(table)
            .values({ ...values, organizationId: org })
            .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        archive
          ? "configuration.archived"
          : id
            ? "configuration.updated"
            : "configuration.created",
        kind,
        after.id,
        before ?? null,
        after,
      );
      return after.id;
    });
  }
  async function convert(actor: Actor, org: string, input: unknown) {
    const data = conversionInput.parse(input);
    return access.within(actor, org, "create", async (tx, context) => {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(visibilityScope(leads, context), eq(leads.id, data.leadId)));
      if (!lead) throw new AccessDenied("Lead unavailable.");
      // Tenant lock in within serializes repeated/concurrent conversion. The stored result is the idempotency record.
      if (lead.convertedAt)
        return {
          contactId: lead.convertedContactId!,
          companyId: lead.convertedCompanyId,
          dealId: lead.convertedDealId,
        };
      if (lead.status === "disqualified")
        throw new AccessDenied("Qualify this lead before converting it.");
      const assignment = {
        organizationId: org,
        ownerId: actor.id,
        assignedTeamId: null,
      };
      let companyId: string | null = data.companyId || null;
      let contactId: string | null = data.contactId || null;
      let matchedContact: typeof contacts.$inferSelect | undefined;
      if (contactId) {
        [matchedContact] = await tx
          .select()
          .from(contacts)
          .where(
            and(visibilityScope(contacts, context), eq(contacts.id, contactId)),
          );
        if (!matchedContact)
          throw new AccessDenied("Matching contact unavailable.");
        if (!companyId) companyId = matchedContact.companyId;
        if (
          data.companyId &&
          matchedContact.companyId &&
          matchedContact.companyId !== data.companyId
        )
          throw new AccessDenied("The contact belongs to a different account.");
      }
      if (companyId) {
        const [company] = await tx
          .select()
          .from(companies)
          .where(
            and(
              visibilityScope(companies, context),
              eq(companies.id, companyId),
            ),
          );
        if (!company) throw new AccessDenied("Matching account unavailable.");
      } else if (data.createCompany && lead.companyName && !matchedContact) {
        const [company] = await tx
          .insert(companies)
          .values({
            ...assignment,
            name: lead.companyName,
            notes: `Created from lead ${lead.id}`,
          })
          .returning();
        companyId = company.id;
        await writeAudit(
          tx,
          org,
          actor.id,
          "record.created",
          "companies",
          company.id,
          null,
          company,
        );
      }
      if (!contactId) {
        const [contact] = await tx
          .insert(contacts)
          .values({
            ...assignment,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            role: lead.role,
            notes: lead.notes,
            tags: lead.tags,
            companyId,
          })
          .returning();
        contactId = contact.id;
        await writeAudit(
          tx,
          org,
          actor.id,
          "record.created",
          "contacts",
          contact.id,
          null,
          contact,
        );
      }
      let dealId: string | null = null;
      if (data.createOpportunity) {
        const [deal] = await tx
          .insert(deals)
          .values({
            ...assignment,
            name: data.opportunityName || `${lead.name} opportunity`,
            companyId,
            contactId,
            sourceId: lead.sourceId,
            notes: lead.notes,
            tags: lead.tags,
          })
          .returning();
        dealId = deal.id;
        await writeAudit(
          tx,
          org,
          actor.id,
          "record.created",
          "deals",
          deal.id,
          null,
          deal,
        );
      }
      const [after] = await tx
        .update(leads)
        .set({
          status: "converted",
          convertedAt: new Date(),
          convertedBy: actor.id,
          convertedCompanyId: companyId,
          convertedContactId: contactId,
          convertedDealId: dealId,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.organizationId, org), eq(leads.id, lead.id)))
        .returning();
      await writeAudit(
        tx,
        org,
        actor.id,
        "lead.converted",
        "leads",
        lead.id,
        lead,
        after,
      );
      return { contactId, companyId, dealId };
    });
  }
  async function duplicateCandidates(
    actor: Actor,
    org: string,
    kind: Kind,
    query: string,
  ) {
    const text = query.trim().slice(0, 160);
    if (!text || !["leads", "contacts", "companies"].includes(kind)) return [];
    return access.within(actor, org, "view", async (tx, context) => {
      const table =
        kind === "companies" ? companies : kind === "leads" ? leads : contacts;
      const column =
        kind === "companies"
          ? companies.name
          : kind === "leads"
            ? leads.email
            : contacts.email;
      return tx
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(
          and(
            visibilityScope(table, context),
            ilike(column, text.replace(/[\\%_]/g, "\\$&")),
          ),
        )
        .orderBy(asc(table.id))
        .limit(10);
    });
  }
  async function duplicates(actor: Actor, org: string, kind: Kind, id: string) {
    idSchema.parse(id);
    return access.within(actor, org, "view", async (tx, context) => {
      const table = tables[kind];
      const [record] = await tx
        .select()
        .from(table)
        .where(and(visibilityScope(table, context), eq(table.id, id)));
      if (!record) throw new AccessDenied();
      if (!("email" in record) && kind !== "companies") return [];
      const duplicateTable =
        kind === "companies" ? companies : kind === "leads" ? leads : contacts;
      const match =
        "email" in record
          ? ilike(
              (kind === "leads" ? leads : contacts).email,
              record.email.replace(/[\\%_]/g, "\\$&"),
            )
          : ilike(companies.name, record.name.replace(/[\\%_]/g, "\\$&"));
      const rows = await tx
        .select({ id: duplicateTable.id, name: duplicateTable.name })
        .from(duplicateTable)
        .where(and(visibilityScope(duplicateTable, context), match))
        .orderBy(asc(duplicateTable.id))
        .limit(11);
      return rows.filter((r) => r.id !== id).slice(0, 10);
    });
  }
  async function attachProduct(
    actor: Actor,
    org: string,
    dealId: string,
    input: unknown,
  ) {
    idSchema.parse(dealId);
    const data = z
      .object({
        productId: idSchema,
        quantity: z.coerce.number().int().min(0).max(10000),
      })
      .parse(input);
    return access.within(actor, org, "edit", async (tx, context) => {
      const [deal] = await tx
        .select()
        .from(deals)
        .where(and(visibilityScope(deals, context), eq(deals.id, dealId)));
      if (!deal) throw new AccessDenied();
      const predicate = and(
        eq(opportunityProducts.organizationId, org),
        eq(opportunityProducts.dealId, dealId),
        eq(opportunityProducts.productId, data.productId),
      );
      const [before] = await tx
        .select()
        .from(opportunityProducts)
        .where(predicate);
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.organizationId, org),
            eq(products.id, data.productId),
            isNull(products.deletedAt),
          ),
        );
      if (!product && !(before && data.quantity === 0))
        throw new AccessDenied("Product unavailable.");
      if (data.quantity === 0)
        await tx.delete(opportunityProducts).where(predicate);
      else
        await tx
          .insert(opportunityProducts)
          .values({
            organizationId: org,
            dealId,
            productId: data.productId,
            quantity: data.quantity,
            unitPrice: before?.unitPrice ?? product!.price,
          })
          .onConflictDoUpdate({
            target: [
              opportunityProducts.organizationId,
              opportunityProducts.dealId,
              opportunityProducts.productId,
            ],
            set: { quantity: data.quantity },
          });
      await writeAudit(
        tx,
        org,
        actor.id,
        "opportunity.product_changed",
        "deals",
        dealId,
        before ?? null,
        data.quantity
          ? {
              productId: data.productId,
              quantity: data.quantity,
              unitPrice: before?.unitPrice ?? product!.price,
            }
          : null,
      );
    });
  }
  async function customer360(
    actor: Actor,
    org: string,
    kind: Kind,
    id: string,
    pageInput: unknown = 1,
  ) {
    idSchema.parse(id);
    const page = pageNumber(pageInput);
    return access.within(actor, org, "view", async (tx, context) => {
      const table = tables[kind];
      const [record] = await tx
        .select()
        .from(table)
        .where(and(visibilityScope(table, context), eq(table.id, id)));
      if (!record) throw new AccessDenied();
      const contactIds = tx
        .select({ id: sql<string>`${contacts.id}::text` })
        .from(contacts)
        .where(
          and(visibilityScope(contacts, context), eq(contacts.companyId, id)),
        );
      const dealIds = tx
        .select({ id: sql<string>`${deals.id}::text` })
        .from(deals)
        .where(
          and(
            visibilityScope(deals, context),
            kind === "companies"
              ? eq(deals.companyId, id)
              : eq(deals.contactId, id),
          ),
        );
      const relatedFilter =
        kind === "companies"
          ? or(
              eq(activities.companyId, id),
              inArray(sql`${activities.contactId}::text`, contactIds),
              inArray(sql`${activities.dealId}::text`, dealIds),
            )
          : kind === "contacts"
            ? or(
                eq(activities.contactId, id),
                inArray(sql`${activities.dealId}::text`, dealIds),
              )
            : kind === "leads"
              ? eq(activities.leadId, id)
              : kind === "deals"
                ? eq(activities.dealId, id)
                : eq(activities.id, id);
      const eventFilter = and(
        eq(auditEvents.organizationId, org),
        or(
          and(eq(auditEvents.entity, kind), eq(auditEvents.entityId, id)),
          kind === "companies"
            ? and(
                eq(auditEvents.entity, "contacts"),
                inArray(auditEvents.entityId, contactIds),
              )
            : undefined,
          kind === "companies" || kind === "contacts"
            ? and(
                eq(auditEvents.entity, "deals"),
                inArray(auditEvents.entityId, dealIds),
              )
            : undefined,
        ),
      );
      const activityRows = await tx
        .select()
        .from(activities)
        .where(and(visibilityScope(activities, context), relatedFilter))
        .orderBy(desc(activities.createdAt), desc(activities.id))
        .limit(50)
        .offset((page - 1) * 50);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(activities)
        .where(and(visibilityScope(activities, context), relatedFilter));
      // No audit snapshots are returned to a record viewer: they may contain prior restricted values.
      const events = await tx
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(eventFilter)
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(50)
        .offset((page - 1) * 50);
      const [{ total: eventsTotal }] = await tx
        .select({ total: count() })
        .from(auditEvents)
        .where(eventFilter);
      const relatedContacts =
        kind === "companies"
          ? await tx
              .select({ id: contacts.id, name: contacts.name })
              .from(contacts)
              .where(
                and(
                  visibilityScope(contacts, context),
                  eq(contacts.companyId, id),
                ),
              )
              .orderBy(asc(contacts.name), asc(contacts.id))
              .limit(50)
              .offset((page - 1) * 50)
          : [];
      const relatedDeals =
        kind === "companies" || kind === "contacts"
          ? await tx
              .select({ id: deals.id, name: deals.name })
              .from(deals)
              .where(
                and(
                  visibilityScope(deals, context),
                  kind === "companies"
                    ? eq(deals.companyId, id)
                    : eq(deals.contactId, id),
                ),
              )
              .orderBy(asc(deals.name), asc(deals.id))
              .limit(50)
              .offset((page - 1) * 50)
          : [];
      const lines =
        kind === "deals"
          ? await tx
              .select({
                productId: products.id,
                name: products.name,
                quantity: opportunityProducts.quantity,
                unitPrice: opportunityProducts.unitPrice,
              })
              .from(opportunityProducts)
              .innerJoin(
                products,
                and(
                  eq(
                    products.organizationId,
                    opportunityProducts.organizationId,
                  ),
                  eq(products.id, opportunityProducts.productId),
                ),
              )
              .where(
                and(
                  eq(opportunityProducts.organizationId, org),
                  eq(opportunityProducts.dealId, id),
                ),
              )
              .orderBy(asc(products.name), asc(products.id))
              .limit(50)
              .offset((page - 1) * 50)
          : [];
      const relatedTotals: number[] = [];
      if (kind === "companies") {
        const [result] = await tx
          .select({ total: count() })
          .from(contacts)
          .where(
            and(visibilityScope(contacts, context), eq(contacts.companyId, id)),
          );
        relatedTotals.push(result.total);
      }
      if (kind === "companies" || kind === "contacts") {
        const [result] = await tx
          .select({ total: count() })
          .from(deals)
          .where(
            and(
              visibilityScope(deals, context),
              kind === "companies"
                ? eq(deals.companyId, id)
                : eq(deals.contactId, id),
            ),
          );
        relatedTotals.push(result.total);
      }
      if (kind === "deals") {
        const [result] = await tx
          .select({ total: count() })
          .from(opportunityProducts)
          .where(
            and(
              eq(opportunityProducts.organizationId, org),
              eq(opportunityProducts.dealId, id),
            ),
          );
        relatedTotals.push(result.total);
      }
      // Conversion links are resolved individually through current visibility; provenance never bypasses access.
      const converted: { kind: Kind; id: string; name: string }[] = [];
      if ("convertedAt" in record && record.convertedAt)
        for (const [target, targetId] of [
          ["contacts", record.convertedContactId],
          ["companies", record.convertedCompanyId],
          ["deals", record.convertedDealId],
        ] as const) {
          if (!targetId) continue;
          const t = tables[target];
          const [r] = await tx
            .select({ id: t.id, name: t.name })
            .from(t)
            .where(and(visibilityScope(t, context), eq(t.id, targetId)));
          if (r) converted.push({ kind: target, ...r });
        }
      return {
        activities: activityRows,
        events,
        relatedContacts,
        relatedDeals,
        lines,
        converted,
        page,
        total: Math.max(total, eventsTotal, ...relatedTotals),
      };
    });
  }
  return {
    configuration,
    configure,
    convert,
    duplicates,
    duplicateCandidates,
    attachProduct,
    customer360,
  };
}
