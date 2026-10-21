"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>We couldn’t load your workspace.</h2>
      <p>
        Try again in a moment. If this is your first run, check your Neon
        connection and run the database migrations described in README.md.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/workspaces">Choose another workspace</Link>
    </div>
  );
}
