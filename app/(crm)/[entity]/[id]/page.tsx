export const instant = false;
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Building2 } from "lucide-react";
import { OpportunityJourneys } from "@/components/funnels/opportunity-journeys";
import { funnelService } from "@/lib/domain/funnels";
import { Customer360 } from "@/components/customer-360";
import { getDb } from "@/lib/db";
import { workflowService } from "@/lib/domain/workflow";
import { getRecord, recordsPage, companyChoices } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import { singular } from "@/lib/format";
import {
  RecordForm,
  DeleteRecord,
  type RecordValues,
} from "@/components/record-form";
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{
    edit?: string;
    companyq?: string;
    companyPage?: string;
    duplicate?: string;
    relatedq?: string;
    relatedPage?: string;
    timelinePage?: string;
    journeyPage?: string;
    relatedKind?: string;
    relatedId?: string;
  }>;
}) {
  const { entity, id } = await params;
  const kind = kindSchema.safeParse(entity);
  if (!kind.success) notFound();
  const info = await workspaceRequest();
  if (id === "new" && !can(info.context.role, "create")) notFound();
  const record = id === "new" ? undefined : await getRecord(kind.data, id);
  if (record === null) notFound();
  const search = await searchParams;
  const choices = await companyChoices(
    record && "companyId" in record && record.companyId
      ? [record.companyId]
      : [],
    search.companyq,
    search.companyPage,
  );
  const companies = choices.rows;
  const service = workflowService(getDb());
  const config = await service.configuration(
    info.actor,
    info.organizationId,
    search.relatedPage,
    search.relatedq,
  );
  const optionLists = await Promise.all(
    (["contacts", "leads", "deals"] as const).map((k) =>
      recordsPage(k, search.relatedq, search.relatedPage),
    ),
  );
  const workflowOptions = {
    sources: config.sources,
    contacts: optionLists[0].rows,
    leads: optionLists[1].rows,
    deals: optionLists[2].rows,
  };
  const managedJourneys =
    record && kind.data === "deals"
      ? await funnelService(getDb()).journeys(
          info.actor,
          info.organizationId,
          record.id,
        )
      : null;
  const converted = Boolean(
    record && "convertedAt" in record && record.convertedAt,
  );
  const timeline = record
    ? await service.customer360(
        info.actor,
        info.organizationId,
        kind.data,
        record.id,
        search.timelinePage,
      )
    : null;
  const duplicates = record
    ? await service.duplicates(
        info.actor,
        info.organizationId,
        kind.data,
        record.id,
      )
    : search.duplicate
      ? await service.duplicateCandidates(
          info.actor,
          info.organizationId,
          kind.data,
          search.duplicate,
        )
      : [];
  let initialRecord: RecordValues | undefined = record ?? undefined;
  if (
    !record &&
    kind.data === "activities" &&
    search.relatedId &&
    search.relatedKind &&
    ["leads", "contacts", "companies", "deals"].includes(search.relatedKind)
  ) {
    const targetKind = kindSchema.parse(search.relatedKind);
    const related = await getRecord(targetKind, search.relatedId);
    if (related)
      initialRecord = {
        name: "",
        [(
          {
            leads: "leadId",
            contacts: "contactId",
            companies: "companyId",
            deals: "dealId",
          } as Record<string, string>
        )[targetKind]]: related.id,
      };
  }

  const edit = search.edit === "true";
  const contactView =
    kind.data === "contacts" &&
    record &&
    "email" in record &&
    (!edit || !can(info.context.role, "edit"));
  return (
    <>
      <Link className="back-link" href={`/${entity}`}>
        <ArrowLeft size={16} />
        Back to {entity}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY CONNECTION COUNTS</span>
          <h1>{record ? record.name : `New ${singular[kind.data]}`}</h1>
          <p>
            {record
              ? "Keep the details close and the relationship growing."
              : "Make space for your next great connection."}
          </p>
        </div>
        {contactView && can(info.context.role, "edit") && (
          <Link className="button primary" href={`/${entity}/${id}?edit=true`}>
            Edit contact
          </Link>
        )}
      </div>
      {kind.data !== "companies" &&
        !contactView &&
        can(info.context.role, record ? "edit" : "create") && (
          <section className="panel panel-heading">
            <h2>Company selection</h2>
            <p className="muted">
              Search before filling the record form; changing the company search
              reloads unsaved fields. Showing up to 50 matching companies plus
              the current link.
            </p>
            <form className="search-box">
              <input type="hidden" name="edit" value="true" />
              <input
                aria-label="Search company options"
                name="companyq"
                defaultValue={search.companyq}
                maxLength={160}
              />
              <button className="button secondary">Find companies</button>
            </form>
            <div className="inline-actions">
              {choices.page > 1 && (
                <Link
                  href={`?${new URLSearchParams({ edit: "true", companyq: search.companyq || "", companyPage: String(choices.page - 1) })}`}
                >
                  Previous companies
                </Link>
              )}
              {choices.page * 50 < choices.total && (
                <Link
                  href={`?${new URLSearchParams({ edit: "true", companyq: search.companyq || "", companyPage: String(choices.page + 1) })}`}
                >
                  More companies
                </Link>
              )}
            </div>
          </section>
        )}
      {["leads", "contacts", "companies"].includes(kind.data) && !record && (
        <section className="panel panel-heading">
          <h2>Check for duplicates</h2>
          <p className="muted">
            Check the email address or exact account name before filling the
            form. Searching reloads unsaved fields.
          </p>
          <form className="search-box">
            <input
              name="duplicate"
              aria-label="Duplicate email or account name"
              defaultValue={search.duplicate}
              maxLength={160}
            />
            <button className="button secondary">Check duplicates</button>
          </form>
          {search.duplicate && !duplicates.length && (
            <p>No exact matches in your permitted scope.</p>
          )}
        </section>
      )}
      {duplicates.length > 0 && (
        <section className="panel panel-heading" role="status">
          <h2>Possible duplicates</h2>
          <p>
            Same email or account name in your permitted scope. Review before
            creating more records.
          </p>
          {duplicates.map((d) => (
            <Link
              key={d.id}
              className="button secondary"
              href={`/${entity}/${d.id}`}
            >
              {d.name}
            </Link>
          ))}
        </section>
      )}
      <section className="panel panel-heading">
        <h2>Related record selection</h2>
        <p className="muted">
          Search before filling forms. Searching reloads unsaved changes.
          Options show 50 records per type; existing links are preserved.
        </p>
        <form className="search-box">
          <input type="hidden" name="edit" value={search.edit ?? ""} />
          <input
            name="relatedq"
            aria-label="Search related records and catalog"
            defaultValue={search.relatedq}
            maxLength={160}
          />
          <button className="button secondary">Find related records</button>
        </form>
        <div className="inline-actions">
          {Number(search.relatedPage) > 1 && (
            <Link
              href={`?${new URLSearchParams({ edit: search.edit ?? "", relatedq: search.relatedq ?? "", relatedPage: String(Number(search.relatedPage) - 1) })}`}
            >
              Previous options
            </Link>
          )}
          {Math.max(config.total, ...optionLists.map((l) => l.total)) >
            (Number(search.relatedPage) || 1) * 50 && (
            <Link
              href={`?${new URLSearchParams({ edit: search.edit ?? "", relatedq: search.relatedq ?? "", relatedPage: String((Number(search.relatedPage) || 1) + 1) })}`}
            >
              More options
            </Link>
          )}
        </div>
      </section>
      {contactView ? (
        <section className="panel contact-detail">
          <span className="detail-avatar">
            {record.name.slice(0, 1).toUpperCase()}
          </span>
          <h2>{record.name}</h2>
          <p className="muted">
            {("role" in record && record.role) || "Contact"}
          </p>
          <div className="contact-links">
            <a href={`mailto:${record.email}`}>
              <Mail size={17} />
              {record.email}
            </a>
            {"phone" in record && record.phone && (
              <a href={`tel:${record.phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={17} />
                {record.phone}
              </a>
            )}
            <span>
              <Building2 size={17} />
              {("companyId" in record &&
                companies.find((c) => c.id === record.companyId)?.name) ||
                ("companyId" in record && record.companyId
                  ? "Company outside your visibility"
                  : "No company linked")}
            </span>
          </div>
          <p>
            Lifecycle: {"lifecycle" in record ? record.lifecycle : "prospect"}
          </p>
          <p>
            Tags: {"tags" in record ? record.tags.join(", ") || "None" : "None"}
          </p>
          <div className="notes">
            <h3>Notes</h3>
            <p>
              {("notes" in record && record.notes) ||
                "No notes yet. Add a little context when you edit this contact."}
            </p>
          </div>
        </section>
      ) : (
        <RecordForm
          kind={kind.data}
          journeyManaged={Boolean(managedJourneys?.total)}
          record={initialRecord}
          workflowOptions={workflowOptions}
          companies={companies}
          readOnly={
            converted || (Boolean(record) && !can(info.context.role, "edit"))
          }
          assignment={
            can(info.context.role, "assign")
              ? {
                  members: info.members
                    .filter(
                      (m) =>
                        info.context.scope === "organization" ||
                        m.userId === info.actor.id ||
                        info.context.peerIds.includes(m.userId),
                    )
                    .map((m) => ({ id: m.userId, name: m.name })),
                  teams: info.teams.filter(
                    (t) =>
                      info.context.scope === "organization" ||
                      info.context.teamIds.includes(t.id),
                  ),
                  currentUserId: info.actor.id,
                }
              : undefined
          }
        />
      )}
      {record && kind.data === "deals" && (
        <OpportunityJourneys
          actor={info.actor}
          organizationId={info.organizationId}
          dealId={record.id}
          editable={can(info.context.role, "edit")}
          page={search.journeyPage}
        />
      )}
      {record && timeline && (
        <Customer360
          kind={kind.data}
          id={record.id}
          data={timeline}
          config={config}
          editable={can(info.context.role, "edit")}
          convertible={
            kind.data === "leads" &&
            !converted &&
            can(info.context.role, "create")
          }
          contacts={workflowOptions.contacts}
          companies={companies}
        />
      )}
      {record && can(info.context.role, "delete") && (
        <DeleteRecord kind={kind.data} id={record.id} />
      )}
    </>
  );
}
