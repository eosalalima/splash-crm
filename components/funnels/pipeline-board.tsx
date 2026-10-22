"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { funnelService } from "@/lib/domain/funnels";
import { stageTiming } from "@/lib/funnels/definition";
import { money } from "@/lib/format";
import { FunnelForm } from "./command-form";
type Board = Awaited<ReturnType<ReturnType<typeof funnelService>["board"]>>;
export function PipelineBoard({
  data,
  editable,
  commandKeys,
}: {
  data: Board;
  editable: boolean;
  commandKeys: Record<string, string>;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [drop, setDrop] = useState<{
    instanceId: string;
    target: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const committedDrop =
    drop &&
    data.rows.find((row) => row.instance.id === drop.instanceId)?.instance
      .currentStage === drop.target;
  return (
    <>
      <p className="muted">
        Use Move to with a keyboard, or drag an active card to choose a
        destination, then confirm Move. The card changes only after the server
        commits. All cards use version {data.version.number}. Values retain the
        app’s existing USD convention.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={refreshing}
        onClick={() => {
          setDrop(null);
          setNotice("");
          startRefresh(() => router.refresh());
        }}
      >
        {refreshing ? "Refreshing…" : "Refresh board"}
      </button>
      <p role="status" aria-live="polite">
        {committedDrop
          ? `Movement committed to ${data.version.definition.stages.find((stage) => stage.id === drop!.target)?.name}.`
          : notice}
      </p>
      <div className="pipeline-board" aria-label="Opportunity pipeline">
        {data.version.definition.stages.map((stage) => (
          <section
            className="pipeline-column"
            key={stage.id}
            aria-label={`${stage.name} stage`}
            onDragOver={(e) => {
              if (editable) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!editable) return;
              try {
                const id = e.dataTransfer.getData("text/plain");
                const row = data.rows.find((r) => r.instance.id === id);
                if (
                  !row ||
                  row.instance.state !== "active" ||
                  !data.version.definition.transitions.some(
                    (t) =>
                      t.from === row.instance.currentStage && t.to === stage.id,
                  )
                ) {
                  setNotice(
                    "That destination is not allowed by the pinned version.",
                  );
                  return;
                }
                setDrop({ instanceId: id, target: stage.id });
                setNotice(
                  `Destination ${stage.name} selected. Review the card’s fields and confirm Move.`,
                );
              } catch {
                setNotice("Choose a destination using Move to.");
              }
            }}
          >
            <h2>{stage.name}</h2>
            <p className="muted">
              {stage.probability}% ·{" "}
              {stage.targetHours
                ? `${stage.targetHours} elapsed-hour target`
                : "No aging target"}{" "}
              · {stage.responsibleRole}
            </p>
            {data.rows
              .filter((r) => r.instance.currentStage === stage.id)
              .map((row) => {
                const allowed = data.version.definition.transitions
                  .filter((t) => t.from === stage.id)
                  .map((t) =>
                    data.version.definition.stages.find((s) => s.id === t.to)!,
                  );
                const { hours, overdue } = stageTiming(
                  row.visit.enteredAt,
                  row.instance.state === "active"
                    ? data.asOf
                    : (row.visit.exitedAt ?? data.asOf),
                  stage.targetHours,
                  row.instance.state === "active",
                );
                return (
                  <article
                    key={row.instance.id}
                    className={`journey-card ${overdue ? "overdue" : ""}`}
                  >
                    {editable && row.instance.state === "active" && (
                      <button
                        type="button"
                        className="button secondary journey-drag-handle"
                        draggable
                        aria-label={`Drag ${row.deal.name}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", row.instance.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() =>
                          setNotice(
                            "Drag this handle to an allowed stage, or choose Move to below with the keyboard.",
                          )
                        }
                      >
                        Drag to choose a stage
                      </button>
                    )}
                    <h3>
                      <Link href={`/deals/${row.deal.id}`}>
                        {row.deal.name}
                      </Link>
                    </h3>
                    <p>
                      {money(row.deal.value)} · journey {row.instance.state}
                    </p>
                    <p>
                      Opportunity status: {row.deal.status} · revision{" "}
                      {row.instance.revision}
                    </p>
                    <p>
                      {hours === null
                        ? "Historical entry time unknown"
                        : `${hours.toFixed(1)} elapsed hours ${row.instance.state === "active" ? "since entry" : "in completed visit"}`}
                      {overdue ? " · Aging target exceeded" : ""}
                    </p>
                    <Link href={`/journeys/${row.instance.id}`}>
                      Journey history
                    </Link>
                    {editable && row.instance.state === "active" && (
                      <MoveControls
                        instanceId={row.instance.id}
                        revision={row.instance.revision}
                        allowed={allowed}
                        reasons={data.version.definition.lossReasons}
                        commandKey={commandKeys[row.instance.id]}
                        suggested={
                          drop?.instanceId === row.instance.id
                            ? drop.target
                            : null
                        }
                        onSelect={() => setDrop(null)}
                      />
                    )}
                  </article>
                );
              })}
            {!data.rows.some((r) => r.instance.currentStage === stage.id) && (
              <p className="muted">No visible journeys on this page.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
function MoveControls({
  instanceId,
  revision,
  allowed,
  reasons,
  commandKey,
  suggested,
  onSelect,
}: {
  instanceId: string;
  revision: number;
  allowed: { id: string; name: string }[];
  reasons: string[];
  commandKey: string;
  suggested: string | null;
  onSelect: () => void;
}) {
  const [target, setTarget] = useState(allowed[0]?.id ?? "");
  return (
    <FunnelForm command="move" id={instanceId} label="Move">
      <input type="hidden" name="commandKey" value={commandKey} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <label>
        Move to
        <select
          name="targetStage"
          value={suggested ?? target}
          onChange={(e) => {
            onSelect();
            setTarget(e.target.value);
          }}
        >
          {allowed.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Outcome reason (required for unsuccessful exit)
        <select name="reason">
          <option value="">Select a reason</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Movement notes
        <textarea name="comment" maxLength={1000} rows={2} />
      </label>
    </FunnelForm>
  );
}
