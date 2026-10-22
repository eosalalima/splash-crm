"use client";
import { useActionState } from "react";
import { funnelAction } from "@/app/(crm)/funnels/actions";
export function FunnelForm({
  command,
  id,
  label,
  children,
  disabled = false,
}: {
  command: string;
  id?: string;
  label: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    funnelAction.bind(null, command, id),
    {},
  );
  return (
    <form
      action={action}
      className="record-form funnel-command"
      // Returned validation errors resolve the action; preserve the chosen
      // destination and corrections instead of accepting React's form reset.
      onReset={(event) => event.preventDefault()}
    >
      <fieldset disabled={disabled || pending}>
        {children}
        <button className="button primary" disabled={disabled || pending}>
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
