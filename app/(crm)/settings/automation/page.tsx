export const instant = false;
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { workspaceRequest } from "@/lib/access/server";
import { getDb } from "@/lib/db";
import { automationService } from "@/lib/domain/automation";
import {
  AutomationEditor,
  AutomationForm,
} from "@/components/automation/forms";
const time = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(date)
    : "—";
export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; catalogPage?: string; q?: string }>;
}) {
  const info = await workspaceRequest();
  const search = await searchParams;
  const service = automationService(getDb());
  const data = await service.overview(
    info.actor,
    info.organizationId,
    search.page,
  );
  const catalog = await service.catalog(
    info.actor,
    info.organizationId,
    search.catalogPage,
    search.q,
  );
  const options = catalog.rows.map((r) => ({
    id: r.version.id,
    label: `${r.name} · v${r.version.number}`,
    stages: r.version.definition.stages.map((s) => ({
      id: s.id,
      name: s.name,
    })),
  }));
  for (const version of data.triggerVersions)
    if (!options.some((o) => o.id === version.id))
      options.push({
        id: version.id,
        label: `Published version ${version.id}`,
        stages: version.definition.stages.map((s) => ({
          id: s.id,
          name: s.name,
        })),
      });
  const href = (page: number, catalogPage = catalog.page) =>
    `?${new URLSearchParams({ page: String(page), catalogPage: String(catalogPage), q: search.q ?? "" })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FOLLOW THROUGH</span>
          <h1>Automation</h1>
          <p>Stage-entry workflows, task creation and in-app notifications.</p>
        </div>
        <Link className="button secondary" href="/settings/automation">
          Refresh status
        </Link>
      </div>
      <section className="panel panel-heading">
        <h2>Create workflow</h2>
        <p>
          Choose a published funnel version and stage, a named recipient,
          optional conditions and actions. Terminal stages are supported.
        </p>
        <form className="search-box">
          <input
            name="q"
            aria-label="Search published funnels"
            defaultValue={search.q}
          />
          <button className="button secondary">Search funnels</button>
        </form>
        <nav className="inline-actions" aria-label="Published funnel versions">
          {catalog.page > 1 && (
            <Link href={href(data.page, catalog.page - 1)}>
              Previous versions
            </Link>
          )}
          {catalog.page * 25 < catalog.total && (
            <Link href={href(data.page, catalog.page + 1)}>More versions</Link>
          )}
        </nav>
        {options.length ? (
          <details>
            <summary>Configure a new workflow</summary>
            <AutomationEditor
              options={options}
              members={info.members}
              commandKey={randomUUID()}
            />
          </details>
        ) : (
          <p className="empty-state">
            No published versions match. Publish a funnel first, or change the
            search.
          </p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Workflows</h2>
        {data.workflows.length ? (
          data.workflows.map(({ workflow, version }) => (
            <article className="funnel-list-item" key={workflow.id}>
              <h3>
                {workflow.name} · v{version.number}
                {workflow.archivedAt ? " · Archived" : ""}
              </h3>
              <p className="event-reference">
                Stage: {version.stageId} · Published {time(version.createdAt)}{" "}
                (Asia/Manila)
              </p>
              {!workflow.archivedAt && (
                <>
                  <details>
                    <summary>Edit and publish a new version</summary>
                    <AutomationEditor
                      options={options}
                      members={info.members}
                      commandKey={randomUUID()}
                      workflow={{
                        id: workflow.id,
                        name: workflow.name,
                        revision: workflow.revision,
                        funnelVersionId: version.funnelVersionId,
                        stageId: version.stageId,
                        definition: version.definition,
                      }}
                    />
                  </details>
                  <AutomationForm
                    command="archive"
                    id={workflow.id}
                    label="Archive workflow"
                  />
                </>
              )}
            </article>
          ))
        ) : (
          <p className="empty-state">No workflows yet.</p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Queue and failures</h2>
        <p>
          Updated when this page is loaded. Times use Asia/Manila. The separate
          worker must be running for events to progress.
        </p>
        <div className="inline-actions">
          {data.queue.map((q) => (
            <p key={q.status}>
              {q.status}: {q.total} · oldest{" "}
              {time(q.oldest ? new Date(q.oldest) : null)}
            </p>
          ))}
        </div>
        {data.events.length ? (
          data.events.map((e) => (
            <article className="funnel-list-item event-reference" key={e.id}>
              <h3>
                {e.type} · {e.status}
              </h3>
              <p>
                Event {e.id} · Transition {e.transitionId}
              </p>
              <p>
                Attempt {e.attempts}/6 · Created {time(e.createdAt)} · Available{" "}
                {time(e.availableAt)} · Lease until {time(e.leaseUntil)}
              </p>
              {e.plan && (
                <p>
                  Evaluated {time(new Date(e.plan.evaluatedAt))} ·{" "}
                  {e.plan.versionIds.length} workflow version(s) retained for
                  retries.
                </p>
              )}
              {e.lastError && <p className="form-error">{e.lastError}</p>}
              {e.status === "failed" && (
                <AutomationForm
                  command="replay"
                  id={e.id}
                  label="Replay failed event"
                />
              )}
            </article>
          ))
        ) : (
          <p className="empty-state">No stage-entry events yet.</p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Run history</h2>
        {data.runs.length ? (
          data.runs.map((r) => (
            <article className="funnel-list-item event-reference" key={r.id}>
              <h3>{r.status}</h3>
              <p>
                Run {r.id} · Event {r.eventId} · Workflow version{" "}
                {r.workflowVersionId}
              </p>
              <p>
                {time(r.createdAt)} · Completed {time(r.completedAt)}
              </p>
              {r.error && <p className="form-error">{r.error}</p>}
            </article>
          ))
        ) : (
          <p>No workflow runs yet.</p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Action history</h2>
        {data.actions.length ? (
          data.actions.map((a) => (
            <article className="funnel-list-item event-reference" key={a.id}>
              <p>
                {a.kind} · {time(a.createdAt)}
              </p>
              <p>
                Run {a.runId} · Action {a.actionId} · Recipient {a.recipientId}
              </p>
              {a.kind === "task" ? (
                <Link href={`/activities/${a.effectId}`}>
                  Open created task
                </Link>
              ) : (
                <p>Notification created · {a.effectId}</p>
              )}
            </article>
          ))
        ) : (
          <p>No actions created yet.</p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Published workflow history</h2>
        {data.versions.map((v) => (
          <details className="event-reference" key={v.id}>
            <summary>
              Workflow {v.automationId} · v{v.number} · {time(v.createdAt)}
            </summary>
            <p>
              Version {v.id} · Publisher {v.publishedBy} · Recipient{" "}
              {v.definition.recipientId}
            </p>
            <p>
              Stage {v.stageId} in funnel version {v.funnelVersionId}
            </p>
            <ul>
              {v.definition.conditions.map((c, i) => (
                <li key={i}>
                  {c.field} {c.operator}
                  {"value" in c ? ` ${c.value}` : ""}
                </li>
              ))}
            </ul>
            <ul>
              {v.definition.actions.map((a) => (
                <li key={a.id}>
                  {a.kind}: {a.title}
                  {a.kind === "task"
                    ? ` · due ${a.dueHours} elapsed hours after entry`
                    : ""}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      <nav
        className="inline-actions"
        aria-label="Automation history pagination"
      >
        {data.page > 1 && (
          <Link href={href(data.page - 1)}>Previous history</Link>
        )}
        {(data.events.length === 25 ||
          data.workflows.length === 25 ||
          data.runs.length === 50 ||
          data.actions.length === 50 ||
          data.versions.length === 50) && (
          <Link href={href(data.page + 1)}>More history</Link>
        )}
      </nav>
    </>
  );
}
