export default function RecordLoading() {
  return (
    <section className="loading-panel" role="status" aria-live="polite">
      <span className="eyebrow">SPLASH CRM</span>
      <h2>Opening record…</h2>
      <div className="skeleton" />
      <div className="skeleton" />
    </section>
  );
}
