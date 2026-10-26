export const instant = false;
import Link from "next/link";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import type { Metadata } from "next";
import { AppearanceToggle } from "@/components/settings/appearance-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const info = await workspaceRequest();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>
            Settings<span className="orange">.</span>
          </h1>
          <p>Personalize the appearance of your workspace.</p>
        </div>
      </div>
      <section className="panel panel-heading">
        <h2>{info.organization.name}</h2>
        <p className="muted">
          Your role: {info.context.role.replaceAll("_", " ")} · Visibility:{" "}
          {info.context.scope}
        </p>
        <div className="inline-actions">
          <Link href="/workspaces" className="button secondary">
            Switch workspace
          </Link>
          {can(info.context.role, "configure") && (
            <Link href="/settings/workspace" className="button primary">
              Manage workspace
            </Link>
          )}
        </div>
      </section>
      <AppearanceToggle />
      {can(info.context.role, "configure") && (
        <div className="inline-actions mt-6">
          <Link className="button secondary" href="/settings/catalog">
            Manage products and lead sources
          </Link>
          <Link className="button secondary" href="/settings/automation">
            Manage automation
          </Link>
        </div>
      )}
    </>
  );
}
