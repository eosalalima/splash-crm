"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-loading">
      <h1>Something interrupted your connection.</h1>
      <p>
        Please try again. Check your Neon configuration if the problem
        continues.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
