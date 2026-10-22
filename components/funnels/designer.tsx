"use client";
import { useActionState, useState } from "react";
import {
  funnelAction,
  type FunnelActionState,
} from "@/app/(crm)/funnels/actions";
import { FunnelForm } from "./command-form";
import {
  orderedTransitions,
  standardFields,
  activityTypes,
  type Definition,
  type Layout,
  type Stage,
} from "@/lib/funnels/definition";
type Draft = {
  id: string;
  name: string;
  description: string;
  draft: Definition;
  layout: Layout;
  draftRevision: number;
  archivedAt: Date | null;
};
export function FunnelDesigner({
  funnel,
  editable,
  commandKey,
}: {
  funnel: Draft;
  editable: boolean;
  commandKey: string;
}) {
  const [name, setName] = useState(funnel.name),
    [description, setDescription] = useState(funnel.description),
    [stages, setStages] = useState(funnel.draft.stages),
    [lossReasons, setReasons] = useState(funnel.draft.lossReasons.join("\n")),
    [layout, setLayout] = useState(funnel.layout),
    [selected, setSelected] = useState(funnel.draft.stages[0].id),
    [expected, setExpected] = useState(funnel.draftRevision);
  const definition = {
    stages,
    transitions: orderedTransitions(stages),
    lossReasons: lossReasons
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean),
  };
  const payload = JSON.stringify({ name, description, definition, layout });
  const [saved, setSaved] = useState(payload);
  const [state, action, pending] = useActionState(
    async (previous: FunnelActionState, form: FormData) => {
      const result = await funnelAction("saveDraft", funnel.id, previous, form);
      if (result.revision) {
        setExpected(result.revision);
        setSaved(payload);
      }
      return result;
    },
    {},
  );
  const stage = stages.find((s) => s.id === selected)!;
  const disabled = !editable || Boolean(funnel.archivedAt);
  const dirty = saved !== payload;
  function update(update: Partial<Stage>) {
    setStages(stages.map((s) => (s.id === selected ? { ...s, ...update } : s)));
  }
  function reorder(id: string, offset: number) {
    const index = stages.findIndex((s) => s.id === id),
      target = stages[index + offset];
    if (!target || target.kind !== "normal") return;
    const next = [...stages];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setStages(next);
  }
  const rules = (side: "entry" | "exit") => (
    <fieldset className="funnel-rules">
      <legend>
        {side === "entry" ? "Required on entry" : "Required before exit"}
      </legend>
      <div>
        <strong>Standard fields</strong>
        {standardFields.map((field) => (
          <label className="check-label" key={field}>
            <input
              type="checkbox"
              checked={stage[
                side === "entry" ? "entryFields" : "exitFields"
              ].includes(field)}
              onChange={(event) => {
                const key = side === "entry" ? "entryFields" : "exitFields";
                update({
                  [key]: event.target.checked
                    ? [...stage[key], field]
                    : stage[key].filter((v) => v !== field),
                });
              }}
            />
            {field}
          </label>
        ))}
      </div>
      <div>
        <strong>Completed opportunity activities</strong>
        {activityTypes.map((type) => (
          <label className="check-label" key={type}>
            <input
              type="checkbox"
              checked={stage[
                side === "entry" ? "entryActivities" : "exitActivities"
              ].includes(type)}
              onChange={(event) => {
                const key =
                  side === "entry" ? "entryActivities" : "exitActivities";
                update({
                  [key]: event.target.checked
                    ? [...stage[key], type]
                    : stage[key].filter((v) => v !== type),
                });
              }}
            />
            {type}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className="panel panel-heading funnel-designer">
      <h2>Funnel designer</h2>
      <p>
        Publish a saved draft to create an immutable version. Existing journeys
        keep their original rules. Stage responsibility is guidance; workspace
        permissions still control movement.
      </p>
      <form
        action={action}
        className="record-form funnel-designer-form"
        onReset={(event) => event.preventDefault()}
      >
        <input type="hidden" name="expectedRevision" value={expected} />
        <input
          type="hidden"
          name="definition"
          value={JSON.stringify(definition)}
        />
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
        <fieldset disabled={disabled || pending}>
          <div className="form-grid">
            <label>
              Funnel name
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
              />
            </label>
            <label>
              Designer layout
              <select
                value={layout.orientation}
                onChange={(e) =>
                  setLayout({
                    orientation: e.target.value as Layout["orientation"],
                  })
                }
              >
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
            <label>
              Unsuccessful outcome reasons (one per line)
              <textarea
                value={lossReasons}
                onChange={(e) => setReasons(e.target.value)}
                rows={4}
                maxLength={2020}
              />
            </label>
          </div>
        </fieldset>
        <div
          className={`funnel-preview ${layout.orientation}`}
          aria-label="Draft execution order"
        >
          {stages.map((s, i) => (
            <div
              key={s.id}
              className={
                s.id === selected
                  ? "funnel-stage-preview selected"
                  : "funnel-stage-preview"
              }
            >
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(s.id)}
                aria-pressed={s.id === selected}
              >
                {i + 1}. {s.name} · {s.probability}%
              </button>
              <small>
                {s.kind} ·{" "}
                {s.targetHours
                  ? `${s.targetHours} elapsed hours`
                  : "No duration target"}
              </small>
              {s.kind === "normal" && editable && !disabled && (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => reorder(s.id, -1)}
                    disabled={pending || stages[i - 1]?.kind !== "normal"}
                    aria-label={`Move ${s.name} up`}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => reorder(s.id, 1)}
                    disabled={pending || stages[i + 1]?.kind !== "normal"}
                    aria-label={`Move ${s.name} down`}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="text-danger"
                    disabled={pending}
                    onClick={() => {
                      setStages(stages.filter((v) => v.id !== s.id));
                      setSelected(stages[0].id);
                    }}
                  >
                    Remove {s.name}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <fieldset disabled={disabled || pending}>
          <button
            type="button"
            className="button secondary"
            disabled={stages.length >= 20}
            onClick={() => {
              const id = `stage_${crypto.randomUUID().replaceAll("-", "")}`;
              const next: Stage = {
                id,
                name: "New stage",
                kind: "normal",
                probability: 50,
                targetHours: 48,
                responsibleRole: "representative",
                entryFields: [],
                exitFields: [],
                entryActivities: [],
                exitActivities: [],
              };
              setStages([...stages.slice(0, -2), next, ...stages.slice(-2)]);
              setSelected(id);
            }}
          >
            Add stage
          </button>
          <h3>Selected stage: {stage.name}</h3>
          <div className="form-grid">
            <label>
              Stage name
              <input
                value={stage.name}
                onChange={(e) => update({ name: e.target.value })}
                maxLength={80}
                required
              />
            </label>
            <label>
              Probability (%)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={stage.probability}
                onChange={(e) =>
                  update({ probability: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Target duration (elapsed hours)
              <input
                type="number"
                min={0}
                max={8760}
                step={1}
                required
                value={stage.targetHours}
                onChange={(e) =>
                  update({ targetHours: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Responsible role
              <select
                value={stage.responsibleRole}
                onChange={(e) =>
                  update({
                    responsibleRole: e.target.value as Stage["responsibleRole"],
                  })
                }
              >
                <option value="representative">Representative</option>
                <option value="manager">Manager</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>
          </div>
          <div className="funnel-rule-groups">
            {rules("entry")}
            {rules("exit")}
          </div>
          {!disabled && (
            <button className="button primary" disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </button>
          )}
        </fieldset>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.message && <p role="status">{state.message}</p>}
      </form>
      {editable && !funnel.archivedAt && (
        <>
          <p className="muted">
            {dirty
              ? "Save your changes before publishing."
              : `Saved draft revision ${expected}. Publication uses this saved revision.`}
          </p>
          <FunnelForm
            command="publish"
            id={funnel.id}
            label="Publish saved draft"
            disabled={dirty || pending}
          >
            <input type="hidden" name="expectedRevision" value={expected} />
            <input type="hidden" name="commandKey" value={commandKey} />
          </FunnelForm>
          <FunnelForm command="archive" id={funnel.id} label="Archive funnel" />
        </>
      )}
    </section>
  );
}
