"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { save, remove } from "@/app/(crm)/actions";
import {
  WorkflowFields,
  type WorkflowValues,
  type WorkflowOptions,
} from "./workflow-fields";
import type { Kind } from "@/lib/validation";
export type RecordValues = WorkflowValues & {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
  website?: string;
  industry?: string;
  value?: number;
  stage?: string;
  companyId?: string | null;
  ownerId?: string;
  assignedTeamId?: string | null;
};
export function RecordForm({
  kind,
  record,
  companies,
  readOnly = false,
  assignment,
  workflowOptions,
}: {
  kind: Kind;
  workflowOptions: WorkflowOptions;
  readOnly?: boolean;
  assignment?: {
    members: { id: string; name: string }[];
    teams: { id: string; name: string }[];
    currentUserId: string;
  };
  record?: RecordValues;
  companies: { id: string; name: string }[];
}) {
  const [state, action, busy] = useActionState(
    save.bind(null, kind, record?.id),
    {},
  );
  return (
    <form action={action} className="record-form panel">
      <div className="panel-heading">
        <h2>{record?.id ? "Record details" : "Start with the essentials"}</h2>
        <p className="muted">A little context makes every connection better.</p>
      </div>
      <fieldset disabled={busy || readOnly}>
        <div className="form-grid">
          <label>
            {kind === "contacts" || kind === "leads"
              ? "Full name"
              : kind === "companies"
                ? "Company name"
                : kind === "deals"
                  ? "Opportunity name"
                  : "Activity title"}
            <input
              name="name"
              defaultValue={record?.name}
              required
              maxLength={160}
              placeholder={
                kind === "contacts" || kind === "leads"
                  ? "Alex Morgan"
                  : kind === "companies"
                    ? "Acme Studio"
                    : "Website redesign"
              }
            />
          </label>
          {(kind === "contacts" || kind === "leads") && (
            <>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={record?.email}
                  placeholder="alex@company.com"
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  maxLength={50}
                  defaultValue={record?.phone}
                  placeholder="+63 917 000 0000"
                />
              </label>
              <label>
                Job title
                <input
                  name="role"
                  maxLength={120}
                  defaultValue={record?.role}
                  placeholder="Founder"
                />
              </label>
            </>
          )}
          {kind === "companies" && (
            <>
              <label>
                Phone
                <input
                  name="phone"
                  maxLength={50}
                  defaultValue={record?.phone}
                />
              </label>
              <label>
                Website
                <input
                  name="website"
                  type="url"
                  defaultValue={record?.website}
                  placeholder="https://example.com"
                />
              </label>
              <label>
                Industry
                <input
                  name="industry"
                  maxLength={120}
                  defaultValue={record?.industry}
                  placeholder="Design & creative"
                />
              </label>
            </>
          )}
          {kind === "deals" && (
            <>
              <label>
                Value (USD)
                <input
                  name="value"
                  type="number"
                  min="0"
                  max="9999999.99"
                  step="0.01"
                  required
                  defaultValue={(record?.value ?? 0) / 100}
                />
              </label>
              <label>
                Legacy stage
                <select name="stage" defaultValue={record?.stage ?? "Lead"}>
                  {["Lead", "Qualified", "Proposal", "Won", "Lost"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(kind === "contacts" ||
            kind === "deals" ||
            kind === "activities") && (
            <label>
              Company
              <select name="companyId" defaultValue={record?.companyId ?? ""}>
                <option value="">No company</option>
                {record?.companyId &&
                  !companies.some((c) => c.id === record.companyId) && (
                    <option value={record.companyId}>
                      Linked company (outside your visibility)
                    </option>
                  )}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <WorkflowFields
            kind={kind}
            record={record}
            options={workflowOptions}
          />
          {assignment && (
            <>
              <label>
                Assigned user
                <select
                  name="ownerId"
                  defaultValue={record?.ownerId ?? assignment.currentUserId}
                >
                  {record?.ownerId &&
                    !assignment.members.some(
                      (m) => m.id === record.ownerId,
                    ) && (
                      <option value={record.ownerId}>
                        Current assignee (inactive or outside your scope)
                      </option>
                    )}
                  {assignment.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned team
                <select
                  name="assignedTeamId"
                  defaultValue={record?.assignedTeamId ?? ""}
                >
                  <option value="">No team</option>
                  {record?.assignedTeamId &&
                    !assignment.teams.some(
                      (t) => t.id === record.assignedTeamId,
                    ) && (
                      <option value={record.assignedTeamId}>
                        Current assigned team
                      </option>
                    )}
                  {assignment.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="wide">
            Notes
            <textarea
              name="notes"
              maxLength={5000}
              rows={5}
              defaultValue={record?.notes}
              placeholder="What should you remember about this connection?"
            />
          </label>
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <Link href={`/${kind}`} className="button secondary">
          Cancel
        </Link>
        {!readOnly && (
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : record?.id ? "Save changes" : "Create record"}
          </button>
        )}
      </div>
    </form>
  );
}
export function DeleteRecord({ kind, id }: { kind: Kind; id: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, busy] = useActionState(remove.bind(null, kind, id), {});
  return (
    <div className="delete-area">
      {confirm ? (
        <form action={action}>
          <p>
            Remove this record from active lists? Its data and audit history
            will be retained.
          </p>
          <div className="inline-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Keep record
            </button>
            <button className="button danger" disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </form>
      ) : (
        <button className="text-danger" onClick={() => setConfirm(true)}>
          Delete record
        </button>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
