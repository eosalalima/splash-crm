export const instant = false;
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Building2 } from "lucide-react";
import { getRecord, companyChoices } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import { singular } from "@/lib/format";
import { RecordForm, DeleteRecord } from "@/components/record-form";
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{
    edit?: string;
    companyq?: string;
    companyPage?: string;
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
          record={record ?? undefined}
          companies={companies}
          readOnly={Boolean(record) && !can(info.context.role, "edit")}
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
      {record && can(info.context.role, "delete") && (
        <DeleteRecord kind={kind.data} id={record.id} />
      )}
    </>
  );
}
