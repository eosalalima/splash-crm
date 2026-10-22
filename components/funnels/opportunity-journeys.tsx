import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { funnelService } from "@/lib/domain/funnels";
import { FunnelForm } from "./command-form";
import type { Actor } from "@/lib/domain/workspace";
export async function OpportunityJourneys({
  actor,
  organizationId,
  dealId,
  editable,
  page,
}: {
  actor: Actor;
  organizationId: string;
  dealId: string;
  editable: boolean;
  page?: string;
}) {
  const service = funnelService(getDb());
  const history = await service.journeys(actor, organizationId, dealId, page);
  const available = editable ? await service.list(actor, organizationId) : null;
  return (
    <section className="panel panel-heading">
      <h2>Funnel journeys</h2>
      <p>
        One active journey per opportunity. Enrollment pins an immutable
        published version; finishing a journey does not silently change
        opportunity status.
      </p>
      {history.rows.map((r) => (
        <p key={r.instance.id}>
          <Link href={`/journeys/${r.instance.id}`}>
            {r.funnel.name} · v{r.version.number} · {r.instance.state}
          </Link>{" "}
          ·{" "}
          <Link href={`/pipeline?version=${r.version.id}`}>Open pipeline</Link>
          {r.instance.baseline ? " · historical entry unknown" : ""}
        </p>
      ))}
      {!history.total && <p>Not enrolled yet.</p>}
      <nav
        className="inline-actions"
        aria-label="Opportunity journey pagination"
      >
        {history.page > 1 && (
          <Link href={`?journeyPage=${history.page - 1}`}>
            Previous journeys
          </Link>
        )}
        {history.page * 50 < history.total && (
          <Link href={`?journeyPage=${history.page + 1}`}>Next journeys</Link>
        )}
      </nav>
      {editable && (
        <FunnelForm command="enroll" id={dealId} label="Enroll opportunity">
          <input type="hidden" name="commandKey" value={randomUUID()} />
          <label>
            Published funnel version
            <select name="versionId">
              <option value="">Choose a published funnel</option>
              {available?.rows
                .filter((f) => f.latest)
                .map((f) => (
                  <option key={f.id} value={f.latest!.id}>
                    {f.name} · v{f.latest!.number}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Specific published version ID (optional)
            <input
              name="versionOverride"
              placeholder="Paste a version reference to use an older publication"
            />
          </label>
          <p className="muted">
            Finish an existing active journey first. Showing the latest
            published versions of up to 50 active funnels.{" "}
            <Link href="/funnels">Search funnels and versions</Link> for an
            older version ID if needed.
          </p>
        </FunnelForm>
      )}
    </section>
  );
}
