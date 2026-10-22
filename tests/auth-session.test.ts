import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { readSession } from "../lib/auth/read-session";

test("render session reads tolerate upstream cookie writes and recheck revocation", async () => {
  let revoked = false;
  let checks = 0;
  const server = createServer((req, res) => {
    checks++;
    assert.equal(req.headers.cookie, "__Secure-neon-auth.session_token=test-token");
    res.setHeader("Content-Type", "application/json");
    // Expiration also returns Set-Cookie: it must not throw during rendering.
    res.setHeader("Set-Cookie", "__Secure-neon-auth.session_token=; Path=/; Max-Age=0; Secure; HttpOnly");
    res.end(JSON.stringify(revoked ? null : { user: { id: "user-1", emailVerified: true }, session: { id: "session-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const headers = new Headers({ cookie: "__Secure-neon-auth.session_token=test-token; unrelated=private" });
    const first = await readSession(baseUrl, "test-only-secret-longer-than-thirty-two-characters", headers);
    assert.equal(first.error, null);
    assert.equal(first.data?.user.id, "user-1");
    revoked = true;
    const second = await readSession(baseUrl, "test-only-secret-longer-than-thirty-two-characters", headers);
    assert.equal(second.error, null);
    assert.equal(second.data, null);
    assert.equal(checks, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
