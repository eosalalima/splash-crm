"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth/client";
export type AuthMode =
  "login" | "signup" | "forgot-password" | "reset-password";
export function AuthForm({
  mode,
  configured,
}: {
  mode: AuthMode;
  configured: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      if (!configured)
        throw new Error(
          "Connect Neon Auth first. Follow the setup instructions in README.md.",
        );
      if (mode === "reset-password" && !params.get("token"))
        throw new Error(
          "This reset link is missing its token. Request a new link.",
        );
      const result =
        mode === "login"
          ? await authClient.signIn.email({ email, password })
          : mode === "signup"
            ? await authClient.signUp.email({
                email,
                password,
                name: String(form.get("name")),
                callbackURL: "/dashboard",
              })
            : mode === "forgot-password"
              ? await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${window.location.origin}/reset-password`,
                })
              : await authClient.resetPassword({
                  newPassword: password,
                  token: params.get("token")!,
                });
      if (result.error)
        throw new Error(
          result.error.message || "Please check your details and try again.",
        );
      if (mode === "forgot-password")
        setMessage(
          "If that email has an account, a reset link is on its way. Check your inbox.",
        );
      else if (mode === "reset-password")
        setMessage("Your password has been updated. You can now sign in.");
      else if (
        mode === "signup" &&
        (!result.data || !("token" in result.data) || !result.data.token)
      )
        setMessage(
          "Account created. Check your email to verify your account, then sign in.",
        );
      else {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-form">
      {!configured && (
        <div className="notice">
          Your workspace is almost ready. Configure Neon Auth in{" "}
          <code>.env.local</code> to enable sign-in. See README.md for setup.
        </div>
      )}
      {mode === "signup" && (
        <label>
          Full name
          <input
            name="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            required
            maxLength={160}
          />
        </label>
      )}
      {mode !== "reset-password" && (
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </label>
      )}
      {mode !== "forgot-password" && (
        <label>
          <span className="label-row">
            {mode === "reset-password" ? "New password" : "Password"}
            {mode === "login" && (
              <Link href="/forgot-password">Forgot password?</Link>
            )}
          </span>
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder="Enter your password"
            minLength={mode === "login" ? 1 : 8}
            maxLength={128}
            required
          />
        </label>
      )}
      {mode === "signup" && (
        <p className="muted small">
          Use at least 8 characters for your password.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      <button className="button primary full" disabled={busy || !configured}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            {mode === "login"
              ? "Sign in to your workspace"
              : mode === "signup"
                ? "Create your account"
                : mode === "forgot-password"
                  ? "Send reset link"
                  : "Update password"}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <p className="auth-switch">
        {mode === "login" ? (
          <>
            New to Splash? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
