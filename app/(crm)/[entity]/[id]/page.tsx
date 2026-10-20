import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Building2 } from "lucide-react";
import { getRecord, companyOptions } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { singular } from "@/lib/format";
import { RecordForm, DeleteRecord } from "@/components/record-form";
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { entity, id } = await params;
  const kind = kindSchema.safeParse(entity);
  if (!kind.success) notFound();
  const record = id === "new" ? undefined : await getRecord(kind.data, id);
  if (record === null) notFound();
  const companies = await companyOptions();
  const edit = (await searchParams).edit === "true";
  const contactView =
    kind.data === "contacts" && record && "email" in record && !edit;
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
        {contactView && (
          <Link className="button primary" href={`/${entity}/${id}?edit=true`}>
            Edit contact
          </Link>
        )}
      </div>
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
                "No company linked"}
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
        />
      )}
      {record && <DeleteRecord kind={kind.data} id={record.id} />}
    </>
  );
}
