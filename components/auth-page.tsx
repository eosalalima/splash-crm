import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Waves, Check, ArrowUpRight } from "lucide-react";
import { currentUser, authConfigured } from "@/lib/auth/server";
import { AuthForm, type AuthMode } from "./auth-form";
const content = {
  login: [
    "Welcome back.",
    "Good relationships start with a little hello. Sign in to pick up where you left off.",
  ],
  signup: [
    "Make room for growth.",
    "Create your personal workspace and bring your customer relationships together.",
  ],
  "forgot-password": [
    "Let’s get you back in.",
    "Enter your email and we’ll send you a link to reset your password.",
  ],
  "reset-password": [
    "A fresh start.",
    "Choose a new password to get back to your workspace.",
  ],
};
async function FormSection({ mode }: { mode: AuthMode }) {
  await connection();
  if ((mode === "login" || mode === "signup") && (await currentUser()))
    redirect("/dashboard");
  return <AuthForm mode={mode} configured={authConfigured()} />;
}
export function AuthPage({ mode }: { mode: AuthMode }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Waves size={24} />
          </span>
          Splash<span className="brand-tag">CRM</span>
        </Link>
        <div className="story-body">
          <span className="eyebrow light">SMALL TEAM. BIG POSSIBILITIES.</span>
          <h1>
            Better connections.
            <br /> Bigger possibilities<span>.</span>
          </h1>
          <p>
            Your people, your pipeline, your next big thing.
            <br />A little more organized. A lot more possible.
          </p>
          <div className="story-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="visual-card">
              <span className="visual-avatar">S</span>
              <div>
                <strong>Relationships that grow</strong>
                <small>One conversation at a time</small>
              </div>
              <ArrowUpRight size={22} />
            </div>
            <div className="visual-chip">
              <Check size={15} /> All in one place
            </div>
            <div className="visual-dot" />
          </div>
          <div className="story-benefits">
            <span>
              <Check size={16} /> Keep people close
            </span>
            <span>
              <Check size={16} /> Move deals forward
            </span>
          </div>
        </div>
        <p className="story-footer">A calmer way to grow your business.</p>
      </section>
      <section className="auth-main">
        <div className="auth-top">
          YOUR NEXT CHAPTER STARTS HERE <span>↗</span>
        </div>
        <div className="auth-box">
          <span className="eyebrow">YOUR RELATIONSHIPS, CONNECTED</span>
          <h2>{content[mode][0]}</h2>
          <p className="auth-description">{content[mode][1]}</p>
          <Suspense
            fallback={<p className="muted">Preparing your workspace…</p>}
          >
            <FormSection mode={mode} />
          </Suspense>
          <div className="auth-trust">
            <span className="trust-dot" /> Secure sign-in powered by Neon Auth
          </div>
        </div>
        <footer className="auth-footer">
          <span>© {2026} Splash CRM</span>
          <span>Built for meaningful connections</span>
        </footer>
      </section>
    </main>
  );
}
