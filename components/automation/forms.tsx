"use client";
import { useActionState, useState } from "react";
import { automationAction } from "@/app/(crm)/settings/automation/actions";
import type { AutomationDefinition } from "@/lib/automation/definition";

type PublishedOption = {
  id: string;
  label: string;
  stages: { id: string; name: string }[];
};
export function AutomationForm({
  command,
  id,
  children,
  label,
}: {
  command: string;
  id?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    automationAction.bind(null, command, id),
    {},
  );
  return (
    <form
      action={action}
      className="record-form funnel-command"
      onReset={(e) => e.preventDefault()}
    >
      <fieldset disabled={pending}>
        {children}
        <button className="button primary" disabled={pending}>
          {pending ? "Working…" : label}
        </button>
      </fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function AutomationEditor({
  options,
  members,
  commandKey,
  workflow,
}: {
  options: PublishedOption[];
  members: { userId: string; name: string; role: string }[];
  commandKey: string;
  workflow?: {
    id: string;
    name: string;
    revision: number;
    funnelVersionId: string;
    stageId: string;
    definition: AutomationDefinition;
  };
}) {
  const [selected, setSelected] = useState(
    workflow?.funnelVersionId ?? options[0]?.id ?? "",
  );
  const [conditions, setConditions] = useState<
    AutomationDefinition["conditions"]
  >(workflow?.definition.conditions ?? []);
  const [actions, setActions] = useState<AutomationDefinition["actions"]>(
    workflow?.definition.actions ?? [
      {
        id: "follow-up",
        kind: "task",
        title: "Follow up on opportunity",
        dueHours: 24,
      },
      {
        id: "notify",
        kind: "notification",
        title: "An opportunity entered the configured stage.",
      },
    ],
  );
  const [recipientId, setRecipientId] = useState(
    workflow?.definition.recipientId ??
      members.find((m) => m.role !== "read_only")?.userId ??
      "",
  );
  const stages = options.find((o) => o.id === selected)?.stages ?? [];
  return (
    <AutomationForm
      command="publish"
      id={workflow?.id}
      label={workflow ? "Publish new version" : "Publish workflow"}
    >
      <input type="hidden" name="commandKey" value={commandKey} />
      <input
        type="hidden"
        name="expectedRevision"
        value={workflow?.revision ?? 0}
      />
      <input
        type="hidden"
        name="definition"
        value={JSON.stringify({ recipientId, conditions, actions })}
      />
      <label>
        Workflow name
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={workflow?.name}
        />
      </label>
      <label>
        Published funnel version
        <select
          name="funnelVersionId"
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label key={selected}>
        Entry stage
        <select
          name="stageId"
          required
          defaultValue={
            workflow?.funnelVersionId === selected
              ? workflow.stageId
              : stages[0]?.id
          }
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Recipient
        <select
          required
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name} ({m.role.replaceAll("_", " ")})
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        The recipient must have access to each opportunity. Tasks also require
        create permission. Due hours run from stage entry, including weekends;
        queued older events may create overdue tasks.
      </p>
      <h3>Conditions (all must match)</h3>
      {conditions.length === 0 && (
        <p>No conditions: every entry to the selected stage matches.</p>
      )}
      {conditions.map((c, index) => (
        <div className="automation-row" key={index}>
          <label>
            Field
            <select
              value={c.field}
              onChange={(e) =>
                setConditions(
                  conditions.map((v, i) =>
                    i !== index
                      ? v
                      : e.target.value === "status"
                        ? { field: "status", operator: "eq", value: "open" }
                        : e.target.value === "expectedClose"
                          ? { field: "expectedClose", operator: "present" }
                          : {
                              field: e.target.value as "value" | "probability",
                              operator: "gte",
                              value: 0,
                            },
                  ),
                )
              }
            >
              <option value="status">Opportunity status</option>
              <option value="value">Amount (minor units)</option>
              <option value="probability">Probability (%)</option>
              <option value="expectedClose">Expected close date</option>
            </select>
          </label>
          <label>
            Operator
            <select
              value={c.operator}
              onChange={(e) =>
                setConditions(
                  conditions.map((v, i) =>
                    i === index
                      ? ({ ...v, operator: e.target.value } as typeof c)
                      : v,
                  ),
                )
              }
            >
              {(c.field === "status"
                ? ["eq", "neq"]
                : c.field === "expectedClose"
                  ? ["present", "absent"]
                  : ["gte", "lte"]
              ).map((op) => (
                <option key={op} value={op}>
                  {
                    {
                      eq: "Equals",
                      neq: "Does not equal",
                      present: "Is set",
                      absent: "Is empty",
                      gte: "At least",
                      lte: "At most",
                    }[op]
                  }
                </option>
              ))}
            </select>
          </label>
          {c.field === "status" ? (
            <label>
              Value
              <select
                value={c.value}
                onChange={(e) =>
                  setConditions(
                    conditions.map((v, i) =>
                      i === index
                        ? {
                            ...c,
                            value: e.target.value as "open" | "won" | "lost",
                          }
                        : v,
                    ),
                  )
                }
              >
                {["open", "won", "lost"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ) : (
            c.field !== "expectedClose" && (
              <label>
                Value
                <input
                  type="number"
                  min={0}
                  max={c.field === "probability" ? 100 : 999999999}
                  required
                  value={c.value}
                  onChange={(e) =>
                    setConditions(
                      conditions.map((v, i) =>
                        i === index
                          ? { ...c, value: e.target.valueAsNumber }
                          : v,
                      ),
                    )
                  }
                />
              </label>
            )
          )}
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setConditions(conditions.filter((_, i) => i !== index))
            }
          >
            Remove condition {index + 1}
          </button>
        </div>
      ))}
      <button
        className="button secondary"
        type="button"
        disabled={conditions.length >= 10}
        onClick={() =>
          setConditions([
            ...conditions,
            { field: "status", operator: "eq", value: "open" },
          ])
        }
      >
        Add condition
      </button>
      <h3>Actions</h3>
      {actions.map((a, index) => (
        <div className="automation-row" key={a.id}>
          <label>
            Action type
            <select
              value={a.kind}
              onChange={(e) =>
                setActions(
                  actions.map((v, i) =>
                    i !== index
                      ? v
                      : e.target.value === "task"
                        ? {
                            id: a.id,
                            kind: "task",
                            title: a.title.slice(0, 160),
                            dueHours: 24,
                          }
                        : { id: a.id, kind: "notification", title: a.title },
                  ),
                )
              }
            >
              <option value="task">Create follow-up task</option>
              <option value="notification">In-app notification</option>
            </select>
          </label>
          <label>
            {a.kind === "task" ? "Task title" : "Notification message"}
            <input
              required
              maxLength={a.kind === "task" ? 160 : 500}
              value={a.title}
              onChange={(e) =>
                setActions(
                  actions.map((v, i) =>
                    i === index ? { ...a, title: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          {a.kind === "task" && (
            <label>
              Due after entry (elapsed hours)
              <input
                type="number"
                min={0}
                max={8760}
                required
                value={a.dueHours}
                onChange={(e) =>
                  setActions(
                    actions.map((v, i) =>
                      i === index
                        ? { ...a, dueHours: e.target.valueAsNumber }
                        : v,
                    ),
                  )
                }
              />
            </label>
          )}
          <button
            className="button secondary"
            type="button"
            disabled={actions.length <= 1}
            onClick={() => setActions(actions.filter((_, i) => i !== index))}
          >
            Remove action {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={actions.length >= 10}
        onClick={() =>
          setActions([
            ...actions,
            {
              id: `action-${crypto.randomUUID()}`,
              kind: "notification",
              title: "Stage entry notification",
            },
          ])
        }
      >
        Add action
      </button>
      <p className="notice">
        Publishing also applies to existing queued events when first processed.
        Once evaluated, retries retain the selected version and condition
        results. Refresh after publishing to edit the new revision.
      </p>
    </AutomationForm>
  );
}
