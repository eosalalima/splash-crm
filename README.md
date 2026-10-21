# Splash CRM

A personal CRM built with Next.js 16.4.2 App Router, React, TypeScript, Tailwind CSS 4, Neon Auth (`@neondatabase/auth` 0.6.0-beta), Neon Postgres, and Drizzle ORM. Includes email/password login, registration, password reset, a dashboard, searchable contacts, company records, and a deal pipeline. Amounts use USD and are stored as integer cents.

## Local setup

1. Run `npm ci` using Node.js 22 or 24.
2. Create a Neon project at https://console.neon.tech. Choose a development branch and enable **Neon Auth** for that branch. Use the current Neon Auth service rather than the legacy Stack Auth integration. This app uses `createNeonAuth` from `@neondatabase/auth/next/server` and the matching Next.js client.
3. Copy `.env.example` to `.env.local`. Never commit `.env.local`.
4. Set `DATABASE_URL` to the branch's Postgres connection string from **Connect**. Use the pooled connection URL and retain the supplied SSL parameters. Set `NEON_AUTH_BASE_URL` to the Auth URL shown in the same branch's Auth configuration panel. Do not substitute the Postgres hostname or application URL.
5. Generate a cookie signing secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store the output as `NEON_AUTH_COOKIE_SECRET` (at least 32 characters). Keep it stable across application instances.
6. In Neon Auth, enable email/password authentication. Add `http://localhost:3000` to the allowed/trusted application origins. Add your production HTTPS origin when deploying. If the console requires redirect URLs, include `/dashboard` and `/reset-password` on those origins. Password reset requests send the full application `/reset-password` URL. Auth API calls are proxied through `/api/auth/[...path]`; no public Auth environment variable is needed.
7. Configure Neon Auth's email delivery and verification/password-reset settings. Verify your email address if verification is enabled. Password recovery cannot be tested until email delivery is configured. This application delegates passwords, sessions, email tokens, and email sending to Neon Auth.
8. Run `npm run db:migrate` against your chosen development database to apply the checked-in migrations. Review the target branch first. The application never migrates or seeds on startup.
9. Run `npm run dev`, open http://localhost:3000, and create an account at `/signup`.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only Neon Postgres connection string |
| `NEON_AUTH_BASE_URL` | Server-only branch Neon Auth endpoint |
| `NEON_AUTH_COOKIE_SECRET` | Server-only signing secret, minimum 32 characters |
| `SEED_OWNER_ID` | Optional existing Neon Auth user ID, only used by the seed command |

When Auth is unconfigured, `/login` shows setup guidance and disables submission. Protected pages redirect to `/login`; there is no demo session or fake persistence. A configured Auth service with a missing/unreachable database shows an error state in the protected workspace.

## Development commands

```sh
npm run dev          # Development server
npm run lint         # ESLint
npm run typecheck    # Generate Next route types, then check TypeScript
npm test            # Embedded Postgres migration/ownership/CRUD and validation tests
npm run build       # Production build
npm run start       # Serve production build
npm run db:generate # Generate a new migration after editing lib/db/schema.ts
npm run db:migrate  # Apply pending migrations to DATABASE_URL
npm run db:seed     # Optional explicit sample records for SEED_OWNER_ID
```

To seed, first create a real account. Copy its user ID from the Neon Auth users panel into `SEED_OWNER_ID` in `.env.local`, then run `npm run db:seed`. The script verifies that user exists in this branch, then creates a demo company, contact, and deal in one atomic batch. It is idempotent for each owner and does not modify Auth tables. Never seed another user's account without permission.

## Data and authorization

- All CRM reads and mutations require a Neon session on the server. Authoritative session reads bypass the SDK cookie cache so session revocation is respected. Session retrieval is not cached with Next.js `use cache`.
- Record ownership comes exclusively from the authenticated session, never from form data. Every list, detail, update, delete, and dashboard query includes owner scoping.
- Composite foreign keys `(company_id, owner_id)` prevent linking contacts or deals to another account's company. Unlink records before deleting their company; deletion is restricted while links exist.
- Neon Auth owns its own schema. Drizzle declares only `crm_*` tables and the `deal_stage` enum. Do not introspect and regenerate provider tables into the application schema.
- Server Actions validate fields using Zod and use Next.js's built-in same-origin action protections. Secrets and database access stay in server-only modules.
- Each account is a personal workspace. Shared organizations, invitations, role administration, and file uploads are outside this starter's scope. Lists show the latest 200 matching records; use search to narrow them.
- Cache Components remains enabled. Session-dependent UI renders inside Suspense. Auth boundaries exist in both the protected layout and data access layer.

## Verification limits

Automated tests run PostgreSQL semantics using an isolated in-memory PGlite instance only for tests. They check generated migrations and production ownership predicates for CRUD and linked-company isolation, plus validation and currency conversion. They do not replace end-to-end Neon session or network tests.

With live credentials, verify registration, optional email verification, login, logout, password reset delivery, and session expiry. Create records in two accounts and confirm each account cannot view or mutate the other's record IDs. Test company deletion while linked and after unlinking. Verify dashboard counts and pipeline values after mutations. Run this against a development branch before production.

Official integration reference: https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md

The production build uses Next.js's supported Webpack compiler because this Windows environment's Turbopack CSS worker exits before connecting. Tailwind uses the documented PostCSS integration. The installed Next.js version and Cache Components settings are preserved.

Dependency review: npm reported transitive moderate advisories in drizzle-kit's older esbuild loader. These concern an esbuild development server; this app does not launch that server. No force downgrade or breaking audit fix was applied. Review upstream dependency updates before production deployment.

### Appearance

Open **Settings** below **Deals** in the sidebar to toggle dark mode. The initial theme follows the device; an explicit light/dark choice is saved in this browser and applies across pages and tabs. It does not sync between devices.
