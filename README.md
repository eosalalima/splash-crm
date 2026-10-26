# Splash CRM

A shared-workspace CRM built with Next.js 16.4.2 App Router, React, TypeScript, Tailwind CSS 4, Neon Auth (`@neondatabase/auth` 0.6.0-beta), Neon Postgres, and Drizzle ORM. Includes email/password login, registration, password reset, a dashboard, searchable contacts, company records, and a deal pipeline. Amounts use USD and are stored as integer cents.

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

| Variable                  | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`            | Server-only Neon Postgres connection string                        |
| `NEON_AUTH_BASE_URL`      | Server-only branch Neon Auth endpoint                              |
| `NEON_AUTH_COOKIE_SECRET` | Server-only signing secret, minimum 32 characters                  |
| `SEED_OWNER_ID`           | Optional existing Neon Auth user ID, only used by the seed command |

When Auth is unconfigured, `/login` shows setup guidance and disables submission. Protected pages redirect to `/login`; there is no demo session or fake persistence. A configured Auth service with a missing/unreachable database shows an error state in the protected workspace.

## Development commands

```sh
npm run dev          # Development server
npm run lint         # ESLint
npm run typecheck    # Generate Next route types, then check TypeScript
npm run test:postgres # Optional dedicated PostgreSQL adapter/concurrency checks
npm test            # Migration, tenant policy, CRM, audit and invitation tests
npm run build       # Production build
npm run start       # Serve production build
npm run db:generate # Generate a new migration after editing lib/db/schema.ts
npm run db:migrate  # Apply pending migrations to DATABASE_URL
npm run db:seed     # Optional explicit sample records for SEED_OWNER_ID
```

To seed, first create a real account. Copy its user ID from the Neon Auth users panel into `SEED_OWNER_ID` in `.env.local`, then run `npm run db:seed`. The command verifies the identity and permits sample records only in that user's empty private workspace. Samples go through the normal authorization/audit services. It does not modify Auth tables, and refuses a nonempty workspace rather than duplicating records. Never seed another user's account without permission.

## Data and authorization

- All CRM reads and mutations require a Neon session on the server. Authoritative session reads bypass the SDK cookie cache so session revocation is respected. Session retrieval is not cached with Next.js `use cache`.
- Workspace context is selected through server-validated active membership. Records carry an organization ID plus assigned user/team; tenant and role visibility are enforced at every data operation.
- Composite foreign keys `(organization_id, company_id)` enforce tenant-safe company links. New links also require visibility. Companies with active linked contacts/deals cannot be soft-deleted until those links are removed.
- Neon Auth owns its own schema. Drizzle declares only `crm_*` tables and application enums. Do not introspect and regenerate provider tables into the application schema.
- Server Actions validate fields using Zod and use Next.js's built-in same-origin action protections. Secrets and database access stay in server-only modules.
- Each historical owner retains a private organization. Shared membership is explicit through verified-email invitations; role/team access is configurable by administrators. Records and company options are paginated. File uploads remain outside Phase 1.
- Cache Components remains enabled. Session-dependent UI renders inside Suspense. Auth boundaries exist in both the protected layout and data access layer.

## Verification limits

Automated tests run PostgreSQL semantics using an isolated in-memory PGlite instance only for tests. They exercise the production workspace/policy/CRM services, populated legacy migrations, tenant isolation, logical deletion, audit atomicity, invitations, pagination, validation and currency conversion. They do not replace end-to-end Neon session or network tests.

With live credentials, verify registration, optional email verification, login, logout, password reset delivery, and session expiry. Create records in two accounts and confirm each account cannot view or mutate the other's record IDs. Test company deletion while linked and after unlinking. Verify dashboard counts and pipeline values after mutations. Run this against a development branch before production.

Official integration reference: https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md

The production build uses Next.js's supported Webpack compiler because this Windows environment's Turbopack CSS worker exits before connecting. Tailwind uses the documented PostCSS integration. The installed Next.js version and Cache Components settings are preserved.

Dependency review: npm reported transitive moderate advisories in drizzle-kit's older esbuild loader. These concern an esbuild development server; this app does not launch that server. No force downgrade or breaking audit fix was applied. Review upstream dependency updates before production deployment.

### Appearance

Open **Settings** below **Deals** in the sidebar to toggle dark mode. The initial theme follows the device; an explicit light/dark choice is saved in this browser and applies across pages and tabs. It does not sync between devices.

### Phase 1 shared workspaces

See [Phase 1 foundation and rollout](docs/phase-1-foundation.md) before migrating an existing database. Runtime queries and `npm run db:migrate` now use the transactional `pg` adapter (PostgreSQL/TCP), not Neon HTTP/WebSocket auto-detection. Provision a disposable development database, verify a backup, stop old application writes, and explicitly run the migration command before deploying this schema/application pair. No migrations run automatically at startup.

Use **Switch workspace** in the sidebar, and **Settings → Manage workspace** for members, roles, teams, invitations and audit history. Invitations require the recipient's matching verified Neon email. The signed-out recipient signs in and reopens the link. Read-only users can browse only their allowed scope and cannot mutate records.

### Invitation email delivery

Workspace invitations support Gmail SMTP over verified TLS (`smtp.gmail.com:465`). Set these server environment variables in `.env.local` (or your hosting environment), then restart the app:

```dotenv
GMAIL_SMTP_USER=your-account@gmail.com
GMAIL_SMTP_APP_PASSWORD=your-16-character-google-app-password
APP_URL=https://your-public-app-domain.com
```

Enable **2-Step Verification** on the sender's Google account, then create an **App password** at https://myaccount.google.com/apppasswords. Use that app password, never your regular Google password. Google may not offer app passwords for managed accounts or accounts subject to certain security policies; contact your Google Workspace administrator in that case. The sender is the authenticated Gmail address. Google sending limits apply.

Use a public HTTPS app URL that recipients can reach (a local-only localhost address will not work for recipients). SMTP egress on port 465 must be allowed by your hosting provider. Keep credentials server-only; never use `NEXT_PUBLIC_` variables or commit them. Neon Auth verification/password emails are configured separately through Neon.

In **Settings → Workspace**, **Send invitation by email** is selected by default when delivery is configured. Uncheck it for a manually shared link. Without configuration, the app retains manual link creation. SMTP acceptance does not guarantee inbox delivery; check the sender's Gmail Sent folder, bounce messages and the recipient's spam folder. No existing pending invitation is sent automatically. To email one, create another invitation for the same address; the old link is revoked. Invitations expire after seven days.

If delivery fails or times out, the invitation remains valid and the administrator receives its link for manual sharing. An SMTP timeout may happen after acceptance, so the UI says delivery could not be confirmed. Retrying by creating a new invitation replaces the old link. A stable Message-ID identifies each invitation but does not guarantee SMTP deduplication. Email sending happens after the audited invitation transaction commits, never inside a database transaction. There is no automatic retry worker.

The tracked environment template has been sanitized. Rotate previously committed database credentials and the cookie-signing secret; replacing the file does not revoke exposed credentials or erase Git history.

## Phase 2 CRM workflow

Leads and Activities are available in the sidebar. Accounts retain `/companies` and Opportunities retain `/deals`. Administrators manage products and lead sources from Settings. Record pages include conversion, duplicate checks, Customer 360 and activity history. See [Phase 2 fields, migration and verification](docs/phase-2-workflow.md) before applying the additive database migration.

## M0 inception and design review

See the [M0 inception package](docs/m0-inception.md) for the confirmed scope/roles and PHP, Asia/Manila, elapsed-time pilot conventions, code comparison, data dictionary, metrics, requirements backlog and outstanding hosting/operations decisions. Open [the offline sales-funnel prototype](docs/m0/prototype/index.html) directly in a browser. It uses fictional in-memory data and does not add application funnel execution. Runtime still uses USD/UTC until the separately tracked locale/data rollout.

## M3 funnels and pipeline

Use **Funnels** to create/clone the approved standard template, save a draft and publish an immutable version. Open an opportunity to enroll it, then use its **Pipeline** and **Journey history** links. Keyboard and drag-to-select movement use the same validated server command. See [M3 migration, versioning and checks](docs/phase-3-funnels.md) before applying migration `0003`; existing deals receive retired legacy versions with explicitly unknown historical entry times. Outbox events are persisted, but worker processing belongs to M4. Existing opportunity money remains USD until the separate PHP rollout.


## M4 automation and notifications

Administrators use **Settings → Manage automation** to publish stage-entry workflows with named recipients, typed conditions, follow-up tasks and in-app notifications. Members use **Notifications** to read updates for opportunities they can currently access. See [M4 migration, processing semantics and worker instructions](docs/phase-4-automation.md) before applying migration `0004` and starting `npm run worker:automation` against an explicitly selected database. The worker is a separate process, not part of `next dev`/`next start`. New workflows can apply to existing pending M3 events under the user-approved latest-at-first-processing policy; retries keep their original evaluation and effects. Hosting, real Neon acceptance and pilot gates remain open.
