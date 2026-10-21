"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function AppearanceToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The server cannot know this browser's preference. Keep hydration consistent.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";

  return (
    <section
      className="workspace-card appearance-card"
      aria-labelledby="appearance-title"
    >
      <div>
        <h2 id="appearance-title">Appearance</h2>
        <p>Choose how Splash looks on this browser.</p>
      </div>
      <div className="appearance-row">
        <div>
          <h3 id="dark-mode-label">Dark mode</h3>
          <p id="dark-mode-help">
            Use a darker background across the application.
          </p>
        </div>
        <button
          type="button"
          className="theme-switch"
          role="switch"
          aria-labelledby="dark-mode-label"
          aria-describedby="dark-mode-help"
          aria-checked={dark}
          disabled={!mounted}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          <span />
        </button>
      </div>
      <p className="appearance-status" role="status">
        {mounted
          ? `${dark ? "Dark" : "Light"} mode is on. Your choice is saved automatically.`
          : "Loading appearance preference…"}
      </p>
    </section>
  );
}
