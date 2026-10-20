import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-loading">
      <span className="eyebrow">404 · SPLASH CRM</span>
      <h1>This connection is missing.</h1>
      <p>The page or record is unavailable.</p>
      <Link className="button primary" href="/dashboard">
        Back to dashboard
      </Link>
    </main>
  );
}
