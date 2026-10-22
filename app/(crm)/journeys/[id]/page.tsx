export const instant = false;
import Link from "next/link";
import { notFound } from "next/navigation";
import { workspaceRequest } from "@/lib/access/server";
import { AccessDenied } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
import { idSchema } from "@/lib/validation";
const time = (date: Date | null) =>
  date
    ? `${new Date(date).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Asia/Manila`
    : "Unknown historical time";
export default async function JourneyHistory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const info = await workspaceRequest();
  let data;
  try {
    data = await funnelService(getDb()).history(
      info.actor,
      info.organizationId,
      id,
      (await searchParams).page,
    );
  } catch (error) {
    if (error instanceof AccessDenied) notFound();
    throw error;
  }
  const name = (stage: string | null) =>
    stage
      ? (data.version.definition.stages.find((s) => s.id === stage)?.name ??
        stage)
      : "Enrollment";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{data.deal.name} · journey history</h1>
          <p>
            Published version {data.version.number} · {data.instance.state} ·
            revision {data.instance.revision}. Opportunity status is
            independently {data.deal.status}.
          </p>
        </div>
      </div>
      <div className="inline-actions">
        <Link
          className="button secondary"
          href={`/pipeline?version=${data.version.id}`}
        >
          Open pinned pipeline
        </Link>
        <Link className="button secondary" href={`/deals/${data.deal.id}`}>
          Open opportunity
        </Link>
      </div>
      {Boolean(data.instance.baseline) && (
        <section className="panel panel-heading">
          <h2>Legacy migration baseline</h2>
          <p>
            Only the stage observed at migration was preserved. Earlier entry
            times, transitions, actors, outcomes dates and reasons are unknown.
            Migration time is not historical stage-entry time. No automation
            event was generated for this baseline.
          </p>
        </section>
      )}
      <section className="panel panel-heading">
        <h2>Stage visits</h2>
        {data.visits.map((v) => (
          <div className="funnel-list-item" key={v.id}>
            <h3>{name(v.stageId)}</h3>
            <p>
              Entered: {time(v.enteredAt)} ·{" "}
              {v.exitedAt
                ? `Closed: ${time(v.exitedAt)}${v.baseline ? " (baseline observation only)" : ""}`
                : "Open visit"}
            </p>
            <p>
              {v.enteredAt && v.exitedAt
                ? `Elapsed duration: ${((new Date(v.exitedAt).getTime() - new Date(v.enteredAt).getTime()) / 3600000).toFixed(2)} hours`
                : v.baseline
                  ? "Historical duration unknown"
                  : "Duration open"}{" "}
              · actor {v.actorId ?? "unknown (migration baseline)"}
            </p>
          </div>
        ))}
      </section>
      <section className="panel panel-heading">
        <h2>Committed movements</h2>
        {data.events.length ? (
          data.events.map((e) => (
            <div className="funnel-list-item" key={e.id}>
              <h3>
                {name(e.fromStage)} → {name(e.toStage)}
              </h3>
              <p>
                {time(e.createdAt)} · actor {e.actorId} · source {e.source} ·
                revision {e.revision}
              </p>
              {e.reason && <p>Reason: {e.reason}</p>}
              {e.comment && <p>Notes: {e.comment}</p>}
              <details>
                <summary>Movement reference</summary>
                <p className="event-reference">
                  Version {e.versionId} · event {e.id} · command {e.commandKey}{" "}
                  · correlation {e.correlationId}
                </p>
              </details>
            </div>
          ))
        ) : (
          <p>
            No movements on this page. A baseline is not an invented transition.
          </p>
        )}
        <nav className="inline-actions" aria-label="Journey history pagination">
          {data.page > 1 && (
            <Link href={`?page=${data.page - 1}`}>Previous history</Link>
          )}
          {data.page * 50 < data.total && (
            <Link href={`?page=${data.page + 1}`}>Next history</Link>
          )}
        </nav>
      </section>
    </>
  );
}
