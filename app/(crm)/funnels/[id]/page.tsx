export const instant = false;
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { workspaceRequest } from "@/lib/access/server";
import { can, AccessDenied } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
import { idSchema } from "@/lib/validation";
import { FunnelDesigner } from "@/components/funnels/designer";
import { FunnelForm } from "@/components/funnels/command-form";
export default async function FunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const info = await workspaceRequest();
  const service = funnelService(getDb());
  let funnel;
  try {
    funnel = await service.configuration(info.actor, info.organizationId, id);
  } catch (error) {
    if (error instanceof AccessDenied) notFound();
    throw error;
  }
  const versions = await service.versions(
    info.actor,
    info.organizationId,
    id,
    (await searchParams).page,
  );
  const editable = can(info.context.role, "configure");
  return (
    <>
      <Link className="back-link" href="/funnels">
        Back to funnels
      </Link>
      <div className="page-heading">
        <div>
          <h1>{funnel.name}</h1>
          <p>
            {funnel.archivedAt
              ? "Archived. Existing journeys can finish; new enrollments are blocked."
              : "Only saved drafts can be published. Version history is immutable."}
          </p>
        </div>
      </div>
      <FunnelDesigner
        funnel={funnel}
        editable={editable}
        commandKey={randomUUID()}
      />
      {editable && (
        <section className="panel panel-heading">
          <h2>Clone into a new draft</h2>
          <p>
            Copies the latest published definition, or the draft when nothing is
            published. Existing instances stay on their original version.
          </p>
          <FunnelForm command="clone" id={id} label="Clone funnel">
            <label>
              Clone name
              <input
                name="name"
                defaultValue={`${funnel.name} copy`.slice(0, 160)}
                maxLength={160}
                required
              />
            </label>
          </FunnelForm>
        </section>
      )}
      <section className="panel panel-heading">
        <h2>Published versions</h2>
        {versions.rows.length ? (
          versions.rows.map((v) => (
            <p key={v.id}>
              <Link href={`/pipeline?version=${v.id}`}>
                Version {v.number} · view pinned pipeline
              </Link>{" "}
              ·{" "}
              {new Date(v.publishedAt).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })}{" "}
              Asia/Manila · {v.definition.stages.map((s) => s.name).join(" → ")}
              <br />
              <span className="event-reference">Version reference: {v.id}</span>
            </p>
          ))
        ) : (
          <p>No published versions yet.</p>
        )}
        <nav className="inline-actions" aria-label="Version pagination">
          {versions.page > 1 && (
            <Link href={`?page=${versions.page - 1}`}>Previous versions</Link>
          )}
          {versions.page * 50 < versions.total && (
            <Link href={`?page=${versions.page + 1}`}>More versions</Link>
          )}
        </nav>
      </section>
    </>
  );
}
