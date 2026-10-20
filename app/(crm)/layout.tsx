import { Suspense } from "react";
import { requireUser } from "@/lib/auth/server";
import { Shell } from "@/components/shell";
async function Protected({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <Shell user={{ name: user.name || "Your account", email: user.email }}>
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
