"use client";
import { useActionState, useState } from "react";
import { workspaceAction } from "@/app/workspaces/actions";
import type { WorkspaceState } from "@/app/workspaces/actions";
export function WorkspaceActionForm({
  operation,
  label,
  children,
}: {
  operation: string;
  label: string;
  children: React.ReactNode;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [state, action, busy] = useActionState(
    async (previous: WorkspaceState, form: FormData) => {
      setTimedOut(false);
      const timer = window.setTimeout(() => setTimedOut(true), 20_000);
      try {
        return await workspaceAction(operation, previous, form);
      } finally {
        window.clearTimeout(timer);
        setTimedOut(false);
      }
    },
    {},
  );
  return (
    <form action={action} className="workspace-action-form">
      <fieldset disabled={busy}>
        {children}
        <button className="button primary" disabled={busy}>
          {busy ? (timedOut ? "Still waiting…" : "Working…") : label}
        </button>
      </fieldset>
      {busy && timedOut && (
        <div role="alert" className="form-error">
          <p>
            No response after 20 seconds. The request may still finish.
            {operation === "invite"
              ? " Check pending invitations before creating another invitation; a new invitation replaces the previous link."
              : " Check the latest workspace state before trying again."}
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Refresh workspace
          </button>
        </div>
      )}
      {!busy && state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {!busy && state.message && (
        <p role="status" className="notice">
          {state.message}
        </p>
      )}
      {!busy && state.invitationPath && (
        <a className="text-link invitation-link" href={state.invitationPath}>
          {state.invitationPath}
        </a>
      )}
    </form>
  );
}
