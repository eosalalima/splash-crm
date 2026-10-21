import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { AppearanceToggle } from "@/components/settings/appearance-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser();
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
      <AppearanceToggle />
    </>
  );
}
