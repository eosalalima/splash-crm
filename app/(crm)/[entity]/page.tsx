import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpRight,
  Users,
  Building2,
  Handshake,
} from "lucide-react";
import { listRecords, companyOptions } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { money, singular } from "@/lib/format";
export default async function Records({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const parsed = kindSchema.safeParse((await params).entity);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const query = (await searchParams).q ?? "";
  const [records, companies] = await Promise.all([
    listRecords(kind, query),
    companyOptions(),
  ]);
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const Icon =
    kind === "contacts" ? Users : kind === "companies" ? Building2 : Handshake;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, CONNECTED</span>
          <h1 className="capitalize">{kind}</h1>
          <p>
            {kind === "contacts"
              ? "Good relationships start with knowing your people."
              : kind === "companies"
                ? "The businesses behind your best connections."
                : "Turn possibilities into your next big win."}
          </p>
        </div>
        <Link className="button primary" href={`/${kind}/new`}>
          <Plus size={17} />
          Add {singular[kind]}
        </Link>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <strong>
            All {kind} <span className="count-pill">{records.length}</span>
          </strong>
          <form className="search-box">
            <Search size={17} />
            <input
              aria-label={`Search ${kind}`}
              name="q"
              defaultValue={query}
              placeholder={`Search ${kind}…`}
              maxLength={160}
            />
            <button type="submit" className="search-submit">
              Search
            </button>
            {query && <Link href={`/${kind}`}>Clear</Link>}
          </form>
        </div>
        {records.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>
                    {kind === "contacts"
                      ? "Email"
                      : kind === "companies"
                        ? "Industry"
                        : "Value"}
                  </th>
                  <th>
                    {kind === "deals"
                      ? "Stage"
                      : kind === "companies"
                        ? "Website"
                        : "Company"}
                  </th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link
                        className="record-name"
                        href={`/${kind}/${record.id}`}
                      >
                        <span className={`table-avatar ${kind}`}>
                          {record.name.slice(0, 1).toUpperCase()}
                        </span>
                        {record.name}
                      </Link>
                    </td>
                    <td>
                      {"email" in record
                        ? record.email
                        : "industry" in record
                          ? record.industry || "—"
                          : "value" in record
                            ? money(record.value)
                            : "—"}
                    </td>
                    <td>
                      {"stage" in record ? (
                        <span
                          className={`stage stage-${record.stage.toLowerCase()}`}
                        >
                          {record.stage}
                        </span>
                      ) : "website" in record ? (
                        record.website || "—"
                      ) : "companyId" in record ? (
                        (companyMap.get(record.companyId ?? "") ?? "—")
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        href={`/${kind}/${record.id}`}
                        aria-label={`View ${record.name}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon size={29} />
            </span>
            <h2>
              {query ? "No matching connections" : `Your ${kind} start here`}
            </h2>
            <p>
              {query
                ? "Try another name or clear your search."
                : `Add your first ${singular[kind]} and give your next opportunity a place to grow.`}
            </p>
            <Link
              className="button secondary"
              href={query ? `/${kind}` : `/${kind}/new`}
            >
              {query ? "Clear search" : `Add ${singular[kind]}`}
              <Plus size={16} />
            </Link>
          </div>
        )}
        <div className="table-footer">
          Showing {records.length} {kind}
          {records.length === 200
            ? " · Latest 200 records; use search to narrow results"
            : ""}
          <span>Only you can access these records</span>
        </div>
      </section>
    </>
  );
}
