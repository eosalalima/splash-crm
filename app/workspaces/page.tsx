export const instant = false;
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { workspaceService } from "@/lib/domain/workspace";
import { getDb } from "@/lib/db";
import { WorkspaceActionForm } from "@/components/workspace-action-form";
async function Workspaces() {
  const actor = await requireUser();
  const list = await workspaceService(getDb()).available(actor, false);
  return (
    <main className="page-content">
      <div className="page-heading">
        <div>
          <h1>Your workspaces</h1>
          <p>Choose a workspace you belong to, or create a new one.</p>
        </div>
      </div>
      <div className="workspace-admin-grid">
        <section className="panel panel-heading">
          <h2>Switch workspace</h2>
          {list.length ? (
            <WorkspaceActionForm operation="switch" label="Open workspace">
              <label>
                Workspace
                <select name="organizationId">
                  {list.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </WorkspaceActionForm>
          ) : (
            <p className="muted">
              No active memberships. Ask an administrator for an invitation or
              create a workspace.
            </p>
          )}
        </section>
        <section className="panel panel-heading">
          <h2>Create workspace</h2>
          <WorkspaceActionForm operation="create" label="Create workspace">
            <label>
              Name
              <input name="name" required maxLength={120} />
            </label>
          </WorkspaceActionForm>
        </section>
      </div>
      <Link href="/dashboard" className="text-link">
        Back to dashboard
      </Link>
    </main>
  );
}
export default function Page() {
  return (
    <Suspense
      fallback={<div className="page-loading">Loading workspaces…</div>}
    >
      <Workspaces />
    </Suspense>
  );
}
