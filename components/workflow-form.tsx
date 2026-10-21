"use client";
import { useActionState } from "react";
import { workflowAction } from "@/app/(crm)/workflow-actions";
export function WorkflowForm({
  command,
  id,
  button,
  children,
}: {
  command: string;
  id?: string;
  button: string;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(
    workflowAction.bind(null, command, id),
    {},
  );
  return (
    <form action={action} className="record-form">
      <fieldset disabled={pending}>{children}</fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      <button className="button primary" disabled={pending}>
        {pending ? "Saving…" : button}
      </button>
    </form>
  );
}
