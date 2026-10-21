export const instant = false;
import { Suspense } from "react";
import { workspaceRequest } from "@/lib/access/server";
import { Shell } from "@/components/shell";
async function Protected({ children }: { children: React.ReactNode }) {
  const info = await workspaceRequest();
  const user = info.actor;
  return (
    <Shell
      user={{ name: user.name || "Your account", email: user.email }}
      organizationName={info.organization.name}
      role={info.context.role}
    >
      {children}
    </Shell>
  );
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<div className="page-loading">Opening your workspace…</div>}
    >
      <Protected>{children}</Protected>
    </Suspense>
  );
}
