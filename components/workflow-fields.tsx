import type { Kind } from "@/lib/validation";
export type WorkflowValues = {
  lifecycle?: string;
  address?: string;
  status?: string;
  probability?: number;
  expectedClose?: string | null;
  sourceId?: string | null;
  contactId?: string | null;
  companyName?: string;
  score?: number;
  scoreReason?: string;
  tags?: string[];
  type?: string;
  priority?: string;
  dueAt?: Date | null;
  outcome?: string;
  leadId?: string | null;
  dealId?: string | null;
};
export type WorkflowOptions = {
  sources: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  leads: { id: string; name: string }[];
  deals: { id: string; name: string }[];
};
export function WorkflowFields({
  kind,
  record = {},
  options,
}: {
  kind: Kind;
  record?: WorkflowValues;
  options: WorkflowOptions;
}) {
  const select = (
    name: keyof WorkflowValues,
    label: string,
    items: { id: string; name: string }[],
  ) => (
    <label key={name}>
      {label}
      <select name={name} defaultValue={String(record[name] ?? "")}>
        <option value="">None</option>
        {record[name] && !items.some((i) => i.id === record[name]) && (
          <option value={String(record[name])}>
            Current link (unavailable or outside this results page)
          </option>
        )}
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {(kind === "companies" || kind === "contacts") && (
        <label>
          Lifecycle
          <select
            name="lifecycle"
            defaultValue={record.lifecycle ?? "prospect"}
          >
            {["prospect", "customer", "inactive"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {kind === "companies" && (
        <label>
          Address
          <input name="address" maxLength={500} defaultValue={record.address} />
        </label>
      )}
      {(kind === "leads" || kind === "deals") &&
        select("sourceId", "Lead source", options.sources)}
      {kind === "leads" && (
        <>
          <label>
            Company name
            <input
              name="companyName"
              maxLength={160}
              defaultValue={record.companyName}
            />
          </label>
          <label>
            Lead status
            <select name="status" defaultValue={record.status ?? "new"}>
              {(record.status === "converted"
                ? ["converted"]
                : ["new", "working", "qualified", "disqualified"]
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Manual score (0–100)
            <input
              name="score"
              type="number"
              min={0}
              max={100}
              defaultValue={record.score ?? 0}
            />
          </label>
          <label>
            Score reason
            <input
              name="scoreReason"
              maxLength={500}
              defaultValue={record.scoreReason}
            />
          </label>
        </>
      )}
      {kind === "deals" && (
        <>
          <label>
            Opportunity status
            <select name="status" defaultValue={record.status ?? "open"}>
              {["open", "won", "lost"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Probability (%)
            <input
              name="probability"
              type="number"
              min={0}
              max={100}
              defaultValue={record.probability ?? 0}
            />
          </label>
          <label>
            Expected close
            <input
              name="expectedClose"
              type="date"
              defaultValue={record.expectedClose ?? ""}
            />
          </label>
          {select("contactId", "Contact", options.contacts)}
        </>
      )}
      {kind === "activities" && (
        <>
          <label>
            Activity type
            <select name="type" defaultValue={record.type ?? "task"}>
              {["task", "call", "meeting", "email", "note"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Activity status
            <select name="status" defaultValue={record.status ?? "open"}>
              {["open", "completed", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={record.priority ?? "normal"}>
              {["low", "normal", "high"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Due date (UTC)
            <input
              name="dueAt"
              type="datetime-local"
              defaultValue={
                record.dueAt
                  ? new Date(record.dueAt).toISOString().slice(0, 16)
                  : ""
              }
            />
          </label>
          <label>
            Outcome
            <textarea
              name="outcome"
              maxLength={2000}
              defaultValue={record.outcome}
            />
          </label>
          {select("leadId", "Related lead", options.leads)}
          {select("contactId", "Related contact", options.contacts)}
          {select("dealId", "Related opportunity", options.deals)}
          <p className="muted">
            Email activities are manual records. No email is sent or
            synchronized.
          </p>
        </>
      )}
      {kind !== "activities" && (
        <label>
          Tags (comma separated)
          <input
            name="tags"
            maxLength={500}
            defaultValue={record.tags?.join(", ")}
          />
        </label>
      )}
    </>
  );
}
