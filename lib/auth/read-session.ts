import { createAuthServer, extractNeonAuthCookies } from "@neondatabase/auth/server";

/** Page rendering cannot persist refreshed cookies. Auth handlers/actions own writes. */
export function readSession(baseUrl: string, cookieSecret: string, headers: Headers) {
  const auth = createAuthServer({
    baseUrl,
    cookieSecret,
    context: () => ({
      getCookies: () => extractNeonAuthCookies(headers),
      setCookie: () => {},
      getHeader: (name) => headers.get(name),
      getOrigin: () => headers.get("origin") || headers.get("referer")?.split("/").slice(0, 3).join("/") || "",
      getFramework: () => "nextjs",
    }),
  });
  // Always validate upstream; a locally cached session must not mask revocation.
  return auth.getSession({ query: { disableCookieCache: "true" } });
}
