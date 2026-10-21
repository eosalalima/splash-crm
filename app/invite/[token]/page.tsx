export const instant = false;
import Link from "next/link";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth/server";
import { WorkspaceActionForm } from "@/components/workspace-action-form";
export const metadata = {
  title: "Workspace invitation",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser();
  return (
    <main className="page-content">
      <section className="panel panel-heading">
        <h1>Join a workspace</h1>
        {!user ? (
          <>
            <p className="muted">
              Sign in or register using the invited email, verify it, then
              return to this invitation link. Do not share this link publicly.
            </p>
            <div className="inline-actions">
              <Link className="button primary" href="/login">
                Sign in
              </Link>
              <Link className="button secondary" href="/signup">
                Register
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Accept using your verified email: {user.email}. The link must be
              active and addressed to you.
            </p>
            <WorkspaceActionForm operation="accept" label="Accept invitation">
              <input type="hidden" name="token" value={token} />
            </WorkspaceActionForm>
          </>
        )}
      </section>
    </main>
  );
}
export default function Page(props: { params: Promise<{ token: string }> }) {
  return (
    <Suspense
      fallback={<div className="page-loading">Loading invitation…</div>}
    >
      <Invitation {...props} />
    </Suspense>
  );
}
