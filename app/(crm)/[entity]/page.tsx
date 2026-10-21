export const instant = false;
import Link from "next/link";
import { CreateRecordLink } from "@/components/create-record-link";
import { notFound } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpRight,
  Users,
  Building2,
  Handshake,
} from "lucide-react";
import { recordsPage, companyOptions } from "@/lib/crm";
import { kindSchema } from "@/lib/validation";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import { money, singular } from "@/lib/format";
export default async function Records({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const parsed = kindSchema.safeParse((await params).entity);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const search = await searchParams;
  const query = search.q ?? "";
  const info = await workspaceRequest();
  const result = await recordsPage(kind, query, search.page);
  const records = result.rows;
  const companies = await companyOptions(
    records.flatMap((r) =>
      "companyId" in r && r.companyId ? [r.companyId] : [],
    ),
  );
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const Icon =
    kind === "contacts" ? Users : kind === "companies" ? Building2 : Handshake;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, CONNECTED</span>
          <h1 className="capitalize">
            {kind === "deals"
              ? "Opportunities"
              : kind === "companies"
                ? "Accounts"
                : kind}
          </h1>
          <p>
            {kind === "contacts"
              ? "Good relationships start with knowing your people."
              : kind === "companies"
                ? "The businesses behind your best connections."
                : "Turn possibilities into your next big win."}
          </p>
        </div>
        {can(info.context.role, "create") && (
          <CreateRecordLink kind={kind} appearance="primary" />
        )}
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <strong>
            All {kind} <span className="count-pill">{result.total}</span>
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
                    {kind === "activities"
                      ? "Type / priority"
                      : kind === "leads"
                        ? "Email"
                        : kind === "contacts"
                          ? "Email"
                          : kind === "companies"
                            ? "Industry"
                            : "Value"}
                  </th>
                  <th>
                    {kind === "activities" || kind === "leads"
                      ? "Status"
                      : kind === "deals"
                        ? "Status / stage"
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
                      {"type" in record
                        ? `${record.type} / ${record.priority}`
                        : "email" in record
                          ? record.email
                          : "industry" in record
                            ? record.industry || "—"
                            : "value" in record
                              ? money(record.value)
                              : "—"}
                    </td>
                    <td>
                      {"status" in record && !("stage" in record) ? (
                        record.status
                      ) : "stage" in record ? (
                        <span
                          className={`stage stage-${record.stage.toLowerCase()}`}
                        >
                          {record.status} / {record.stage}
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
            {(query || can(info.context.role, "create")) &&
              (query ? (
                <Link className="button secondary" href={`/${kind}`}>
                  Clear search <Plus size={16} />
                </Link>
              ) : (
                <CreateRecordLink kind={kind} appearance="secondary" />
              ))}
          </div>
        )}
        <div className="table-footer">
          <span>
            Page {result.page} · {result.total} {kind} in your permitted scope
          </span>
          <nav aria-label="Pagination" className="inline-actions">
            {result.page > 1 && (
              <Link
                href={`/${kind}?${new URLSearchParams({ q: query, page: String(result.page - 1) })}`}
              >
                Previous
              </Link>
            )}
            {result.page * result.pageSize < result.total && (
              <Link
                href={`/${kind}?${new URLSearchParams({ q: query, page: String(result.page + 1) })}`}
              >
                Next
              </Link>
            )}
          </nav>
        </div>
      </section>
    </>
  );
}
