export const instant = false;
import Link from "next/link";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
import { FunnelForm } from "@/components/funnels/command-form";
export default async function Funnels({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; archived?: string }>;
}) {
  const info = await workspaceRequest(),
    search = await searchParams;
  const result = await funnelService(getDb()).list(
    info.actor,
    info.organizationId,
    search.q,
    search.page,
    search.archived === "true",
  );
  const href = (page: number) =>
    `?${new URLSearchParams({ q: search.q ?? "", archived: search.archived ?? "", page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DESIGN YOUR SALES JOURNEY</span>
          <h1>Funnels</h1>
          <p>
            Draft, publish and clone versioned funnels. Existing journeys retain
            their published rules.
          </p>
        </div>
        <Link className="button secondary" href="/pipeline">
          Open pipeline
        </Link>
      </div>
      {can(info.context.role, "configure") && (
        <section className="panel panel-heading">
          <h2>Create from standard sales template</h2>
          <p>
            Lead → Qualified → Proposal → Won, with Lost exits. Approved
            probabilities, durations and required fields are included;
            completed-call gates can be configured.
          </p>
          <FunnelForm command="create" label="Create funnel">
            <label>
              New funnel name
              <input name="name" maxLength={160} required />
            </label>
          </FunnelForm>
        </section>
      )}
      <section className="panel panel-heading">
        <form className="search-box">
          <input
            name="q"
            aria-label="Search funnels"
            defaultValue={search.q}
            maxLength={160}
          />
          <input type="hidden" name="archived" value={search.archived ?? ""} />
          <button className="button secondary">Search</button>
        </form>
        <p>
          <Link
            href={
              search.archived === "true" ? "/funnels" : "/funnels?archived=true"
            }
          >
            {search.archived === "true"
              ? "Show active funnels"
              : "Include archived funnels"}
          </Link>
        </p>
        {result.rows.length ? (
          result.rows.map((f) => (
            <article key={f.id} className="funnel-list-item">
              <h2>
                <Link href={`/funnels/${f.id}`}>{f.name}</Link>
              </h2>
              <p>
                {f.archivedAt ? "Archived" : "Active"} ·{" "}
                {f.latest ? `Published v${f.latest.number}` : "Draft only"}
                {f.kind === "legacy" ? " · legacy migration baseline" : ""}
              </p>
              <div className="inline-actions">
                <Link className="button secondary" href={`/funnels/${f.id}`}>
                  View{" "}
                  {can(info.context.role, "configure")
                    ? "designer"
                    : "definition"}
                </Link>
                {f.latest && (
                  <Link
                    className="button secondary"
                    href={`/pipeline?version=${f.latest.id}`}
                  >
                    View pipeline
                  </Link>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            No funnels match. Administrators can create the standard template
            above.
          </p>
        )}
        <nav aria-label="Funnel pagination" className="inline-actions">
          {result.page > 1 && (
            <Link href={href(result.page - 1)}>Previous</Link>
          )}
          {result.page * 50 < result.total && (
            <Link href={href(result.page + 1)}>Next</Link>
          )}
        </nav>
      </section>
    </>
  );
}
