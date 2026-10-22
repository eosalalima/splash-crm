export const instant = false;
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { workspaceRequest } from "@/lib/access/server";
import { can, AccessDenied } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
import { idSchema } from "@/lib/validation";
import { PipelineBoard } from "@/components/funnels/pipeline-board";
export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; q?: string; page?: string }>;
}) {
  const info = await workspaceRequest(),
    search = await searchParams;
  const service = funnelService(getDb());
  if (!search.version)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Pipeline</h1>
            <p>
              Choose a published version from Funnels to see its pinned
              journeys.
            </p>
          </div>
        </div>
        <Link className="button primary" href="/funnels">
          Choose a funnel
        </Link>
        <p className="muted">
          Enroll opportunities from their detail pages. Legacy baselines are
          available through opportunity history or archived funnels.
        </p>
      </>
    );
  if (!idSchema.safeParse(search.version).success)
    return (
      <p role="alert">
        Invalid published version. <Link href="/funnels">Choose a funnel</Link>
      </p>
    );
  let data;
  try {
    data = await service.board(
      info.actor,
      info.organizationId,
      search.version,
      search.q,
      search.page,
    );
  } catch (error) {
    if (error instanceof AccessDenied)
      return (
        <p role="alert">
          Published version unavailable in this workspace.{" "}
          <Link href="/funnels">Choose a funnel</Link>
        </p>
      );
    throw error;
  }
  const href = (page: number) =>
    `?${new URLSearchParams({ version: search.version!, q: search.q ?? "", page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PINNED, VERSIONED SALES JOURNEYS</span>
          <h1>
            {data.funnel.name} · v{data.version.number}
          </h1>
          <p>
            {data.total} visible journeys
            {data.funnel.archivedAt
              ? " · archived funnel: existing journeys may finish"
              : ""}
            . Observed{" "}
            {new Date(data.asOf).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            Asia/Manila.
          </p>
        </div>
        <Link className="button secondary" href={`/funnels/${data.funnel.id}`}>
          Funnel versions
        </Link>
      </div>
      <form className="search-box">
        <input type="hidden" name="version" value={search.version} />
        <input
          name="q"
          aria-label="Search pipeline"
          defaultValue={search.q}
          maxLength={160}
        />
        <button className="button secondary">Search</button>
      </form>
      {!data.total && (
        <section className="panel panel-heading">
          <h2>No visible journeys</h2>
          <p>
            Open an opportunity and enroll it into this published version, or
            clear your search.
          </p>
          <Link href="/deals">Open opportunities</Link>
        </section>
      )}
      <PipelineBoard
        data={data}
        editable={can(info.context.role, "edit")}
        commandKeys={Object.fromEntries(
          data.rows.map((r) => [r.instance.id, randomUUID()]),
        )}
      />
      <nav className="inline-actions" aria-label="Pipeline pagination">
        {data.page > 1 && <Link href={href(data.page - 1)}>Previous</Link>}
        {data.page * 50 < data.total && (
          <Link href={href(data.page + 1)}>Next</Link>
        )}
        <span>Page {data.page} · up to 50 journeys across all columns</span>
      </nav>
    </>
  );
}
