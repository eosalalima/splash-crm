// Test-only Neon HTTP contract simulator. It never runs in the application.
// It exercises the installed SDK/proxy/cookies, but does not deliver real email.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
let users = new Map();
let sessions = new Map();
let autoSession = false;
let calls = [];
const now = () => new Date().toISOString();
const expires = () => new Date(Date.now() + 86400000).toISOString();
const cookieName = "__Secure-neon-auth.session_token";
function user(email, verified = false) {
  return {
    id: randomUUID(),
    name: "Test User",
    email,
    emailVerified: verified,
    createdAt: now(),
    updatedAt: now(),
    image: null,
  };
}
function session(profile) {
  const token = randomUUID();
  sessions.set(token, {
    user: profile,
    session: {
      id: randomUUID(),
      token,
      userId: profile.id,
      expiresAt: expires(),
      createdAt: now(),
      updatedAt: now(),
      ipAddress: null,
      userAgent: null,
    },
  });
  return token;
}
createServer(async (req, res) => {
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://localhost:4444");
    const path = url.pathname;
    const reply = (data, status = 200, token) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      if (token !== undefined)
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${token ? "" : "; Max-Age=0"}`,
        );
      res.end(JSON.stringify(data));
    };
    const fail = (code, status = 400) => reply({ code, message: code }, status);
    if (path === "/__test/reset") {
      users = new Map();
      sessions = new Map();
      calls = [];
      autoSession = Boolean(body.autoSession);
      return reply({ ok: true });
    }
    if (path === "/__test/calls") return reply(calls);
    if (path === "/__test/unverified") {
      const profile = user(body.email);
      users.set(body.email, profile);
      return reply({ token: session(profile) });
    }
    // Store endpoint names and email only, never test passwords or OTPs.
    calls.push({ path, email: body.email, query: url.search });
    const token = req.headers.cookie?.match(
      /__Secure-neon-auth\.session_token=([^;]+)/,
    )?.[1];
    if (path === "/auth/get-session") return reply(sessions.get(token) || null);
    if (path === "/auth/sign-up/email") {
      if (users.has(body.email)) return fail("USER_ALREADY_EXISTS", 422);
      const profile = user(body.email);
      users.set(body.email, profile);
      return reply({ user: profile, token: null });
    }
    if (path === "/auth/sign-in/email") {
      const profile = users.get(body.email);
      if (!profile) return fail("INVALID_EMAIL_OR_PASSWORD", 401);
      if (!profile.emailVerified) return fail("EMAIL_NOT_VERIFIED", 403);
      const next = session(profile);
      return reply({ user: profile, token: next, redirect: false }, 200, next);
    }
    if (path === "/auth/email-otp/send-verification-otp") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (body.type !== "email-verification") return fail("INVALID_TYPE");
      return reply({ success: true });
    }
    if (path === "/auth/email-otp/verify-email") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (body.otp === "000000") return fail("OTP_EXPIRED");
      if (body.otp !== "123456") return fail("INVALID_OTP");
      const profile = users.get(body.email);
      if (!profile) return fail("INVALID_OTP");
      profile.emailVerified = true;
      const next = autoSession ? session(profile) : null;
      return reply(
        { status: true, token: next, user: profile },
        200,
        next || undefined,
      );
    }
    if (path === "/auth/sign-out") {
      sessions.delete(token);
      return reply({ success: true }, 200, "");
    }
    return fail("NOT_FOUND", 404);
  } catch {
    res.statusCode = 500;
    res.end("Fixture failure");
  }
}).listen(4444, "127.0.0.1");
