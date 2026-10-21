"use client";
import { useActionState } from "react";
import { workspaceAction } from "@/app/workspaces/actions";
export function WorkspaceActionForm({
  operation,
  label,
  children,
}: {
  operation: string;
  label: string;
  children: React.ReactNode;
}) {
  const [state, action, busy] = useActionState(
    workspaceAction.bind(null, operation),
    {},
  );
  return (
    <form action={action} className="workspace-action-form">
      <fieldset disabled={busy}>
        {children}
        <button className="button primary" disabled={busy}>
          {busy ? "Working…" : label}
        </button>
      </fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="notice">
          {state.message}
        </p>
      )}
      {state.invitationPath && (
        <a className="text-link invitation-link" href={state.invitationPath}>
          {state.invitationPath}
        </a>
      )}
    </form>
  );
}
