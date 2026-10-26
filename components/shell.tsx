"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Waves,
  Settings as SettingsIcon,
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  GitBranch,
  Columns3,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
} from "lucide-react";
import { clearWorkspaceSelection } from "@/app/workspaces/actions";
import { authClient } from "@/lib/auth/client";
const nav = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/leads", "Leads", Users],
  ["/contacts", "Contacts", Users],
  ["/companies", "Accounts", Building2],
  ["/deals", "Opportunities", Handshake],
  ["/activities", "Activities", Users],
  ["/funnels", "Funnels", GitBranch],
  ["/pipeline", "Pipeline", Columns3],
  ["/settings", "Settings", SettingsIcon],
] as const;
export function Shell({
  user,
  children,
  organizationName,
  role,
}: {
  user: { name: string; email: string };
  organizationName: string;
  role: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      await clearWorkspaceSelection();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign-out failed. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
      <button
        className="mobile-menu icon-button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        {open ? <X /> : <Menu />}
      </button>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <Waves size={23} />
          </span>
          Splash<span className="brand-tag">CRM</span>
        </Link>
        <div className="workspace-label">{organizationName}</div>
        <Link href="/workspaces" className="workspace-switch">
          Switch workspace
        </Link>
        <nav aria-label="Main navigation">
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={path.startsWith(href) ? "page" : undefined}
              className={path.startsWith(href) ? "active" : ""}
            >
              <Icon size={19} />
              {label}
              {path.startsWith(href) && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ArrowUpRight size={21} />
            <strong>Make your next move.</strong>
            <p>Great relationships are built one conversation at a time.</p>
          </div>
          <details className="user-menu">
            <summary>
              <span className="avatar">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{role.replaceAll("_", " ")}</small>
              </span>
            </summary>
            <div className="user-details">
              <p>{user.email}</p>
              {/* Form extensions may inject fdprocessedid before hydration. */}
              <button
                disabled={busy}
                onClick={logout}
                suppressHydrationWarning
              >
                <LogOut size={16} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
              {error && <p role="alert">{error}</p>}
            </div>
          </details>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <span>
            Workspace{" "}
            <span className="breadcrumb">
              / {nav.find(([href]) => path.startsWith(href))?.[1] ?? "Overview"}
            </span>
          </span>
          <span className="personal-badge">
            <span className="trust-dot" /> Workspace CRM
          </span>
        </header>
        <main className="page-content">{children}</main>
        <footer className="workspace-footer">
          A little clarity. A lot of possibility. <span>Splash CRM</span>
        </footer>
      </div>
    </div>
  );
}
