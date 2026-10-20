import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  Users,
  Building2,
  Handshake,
  TrendingUp,
} from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { dashboardStats, listRecords } from "@/lib/crm";
import { money } from "@/lib/format";
export default async function Dashboard() {
  const user = await requireUser();
  const [stats, contacts] = await Promise.all([
    dashboardStats(),
    listRecords("contacts"),
  ]);
  const metrics = [
    ["Total contacts", stats.contacts, Users, "/contacts"],
    ["Companies", stats.companies, Building2, "/companies"],
    ["Open deals", stats.openDeals, Handshake, "/deals"],
    ["Open pipeline", money(stats.pipeline), TrendingUp, "/deals"],
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
          <h1>
            Hello, {user.name?.split(" ")[0] || "there"}
            <span className="orange">.</span>
          </h1>
          <p>
            Here’s where your relationships stand. Let’s make something happen.
          </p>
        </div>
        <Link className="button primary" href="/contacts/new">
          <Plus size={17} />
          Add contact
        </Link>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value, Icon, href]) => (
          <Link className="metric-card" href={href} key={label}>
            <span className="metric-label">
              {label}
              <Icon size={19} />
            </span>
            <strong>{value}</strong>
            <span className="metric-foot">
              View {label === "Open pipeline" ? "deals" : label.toLowerCase()}
              <ArrowUpRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Your deal pipeline</h2>
              <p className="muted">From first hello to a well-earned win.</p>
            </div>
            <Link href="/deals" className="text-link">
              View deals <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="pipeline">
            {["Lead", "Qualified", "Proposal", "Won", "Lost"].map((stage) => {
              const item = stats.stages.find((s) => s.stage === stage);
              const total = stats.stages.reduce((a, s) => a + s.count, 0);
              return (
                <div className="pipeline-row" key={stage}>
                  <span className={`stage stage-${stage.toLowerCase()}`}>
                    {stage}
                  </span>
                  <div className="pipeline-track">
                    <div
                      style={{
                        width: `${total ? ((item?.count ?? 0) / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span>{item?.count ?? 0}</span>
                  <strong>{money(Number(item?.value ?? 0))}</strong>
                </div>
              );
            })}
          </div>
          {!stats.stages.length && (
            <div className="pipeline-hint">
              Your next opportunity belongs here.{" "}
              <Link href="/deals/new">Create a deal ↗</Link>
            </div>
          )}
        </section>
        <section className="next-step">
          <span className="eyebrow">ROOM TO GROW</span>
          <h2>
            Small steps.
            <br />
            Lasting connections.
          </h2>
          <p>
            A name, a conversation, a possibility. Every good relationship
            starts somewhere.
          </p>
          <Link href="/contacts/new" className="button light-button">
            Make a connection
            <ArrowUpRight size={18} />
          </Link>
          <div className="next-decoration" aria-hidden="true">
            ↗
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Recent connections</h2>
            <p className="muted">The newest people in your corner.</p>
          </div>
          <Link href="/contacts" className="text-link">
            All contacts
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {contacts.length ? (
          <div className="recent-list">
            {contacts.slice(0, 5).map((c) => (
              <Link href={`/contacts/${c.id}`} key={c.id}>
                <span className="table-avatar">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>{"email" in c ? c.email : ""}</small>
                </span>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <Users size={26} />
            <h3>Start with a hello.</h3>
            <p>Your latest contacts will appear here.</p>
            <Link className="text-link" href="/contacts/new">
              Add your first contact <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
