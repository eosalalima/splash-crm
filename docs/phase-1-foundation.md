# Phase 1 / M1: shared workspace foundation

The implementation plan uses milestone names M0–M5. **Phase 1 means M1**, not M0 or the later CRM/funnel phases. These initial defaults make the foundation concrete; product acceptance of the broader M0 decisions remains separate.

## Access and tenancy

- A workspace is a tenant organization, distinct from a customer company.
- The signed-in Neon user is resolved on the server. The HTTP-only `splash-organization` cookie selects an organization ID only; it conveys no permissions. Each service checks active database membership and permissions again.
- A new user receives a private workspace on first authenticated access. Existing owners are migrated into separate private organizations. Revoked private membership is never silently recreated. `/workspaces` remains available to choose another active workspace or explicitly create one.
- Persona mapping: workspace creators/explicitly appointed administrators map to Administrator; sales/team managers to Manager; account executives/sales representatives to Representative; observers, auditors and reporting-only analysts to Read-only. This mapping must be assigned explicitly by an administrator; job titles and provider metadata never grant permissions. Unmapped personas receive no access.
- Fixed presets: Administrator has organization visibility and all permissions; Manager has team visibility and view/create/edit/delete/assign/approve/export; Representative has own visibility and view/create/edit/delete; Read-only has organization visibility and view only. Other personas must be mapped to one of these presets. Custom roles and department scopes are denied, not approximated by wider access.
- Team visibility includes the actor's own records, records owned by active peers in shared teams, and records explicitly assigned to those teams. Removing a user from a team does not automatically reassign the team's existing records. Administrators must reassign them deliberately.
- Record assignment is separate from tenancy. Reassignment requires `assign`, an active target membership, permitted visibility, and a valid same-organization team membership when assigning a team.
- `approve` and `export` are explicit policy permissions for future domain operations; M1 does not introduce approval workflows or user-facing export (release 1.1).
- Company links use organization-aware foreign keys. New links must also be visible and active. A company cannot be logically deleted while active contacts/deals still reference it.

## Transactions and audit

The runtime and migration command use the `pg` driver with Drizzle's `node-postgres` adapter. This supports interactive transactions over PostgreSQL, unlike the previous Neon HTTP adapter. Keep the provider's TLS verification settings; the application does not disable certificate checks. Configure network access for PostgreSQL/TCP and a modest per-instance pool (currently five connections).

Every domain operation obtains a workspace-row lock, then reads active membership, calculates visibility, and performs its work inside that transaction. This conservative initial design serializes reads/writes per tenant, so role changes and revocation cannot race with an authorized mutation. Optimize lock granularity only with equivalent isolation and concurrency tests. Application reads remain uncached; React/Next shared permission caches are not introduced.

Business mutations, assignments, membership changes, teams and invitations write audit events in the same transaction. If audit insertion fails, the business change rolls back. Audit events carry organization, actor, timestamp, action, entity and before/after data. Update/delete/truncate triggers reject audit mutation. Database administrators who can alter triggers still require operational controls and a separate least-privilege application role.

Audit history is administrator-only at `/settings/audit`, with pagination. Migration events are explicit baselines, not historical business actions. Neon Auth owns identity-provider login events; this SDK integration does not expose a reliable provider-side login audit feed. No fake login events are written. Verify provider audit availability/retention in the Neon project during deployment; forwarding those events is an integration follow-up.

## Membership and invitations

Administrators manage members, fixed roles, teams and pending invitations in **Settings → Manage workspace**. Invitations are manual secure links, not automatically sent emails. Tokens are random, stored only as SHA-256 hashes, single-use and valid for seven days. Reissuing an invitation invalidates prior pending links for that email in that organization. Revocation is available before acceptance.

Acceptance requires a signed-in user with the matching verified email and an inviter who still has configure permission. Existing active membership is preserved rather than silently changing its role. A revoked membership can be reactivated through a new valid invitation. The final active administrator cannot be removed or demoted.

Signed-out recipients sign in/register and verify their address, then reopen the invitation link. This does not replace the existing Neon verification flow or disable verification.

## Data and UI

Records are soft-deleted, retained in the database/audit trail and excluded from lists, details, search, company choices and dashboard aggregates. Existing URLs and IDs remain stable. Lists and company-option searches use deterministic 50-item pages and retain search parameters. Visible current company selections are included even when outside the selected options page. A hidden existing company link is represented by a neutral placeholder and preserved during unrelated edits; its name is not disclosed. Inactive/out-of-scope existing assignees are likewise preserved until an authorized reassignment.

Role-sensitive controls are hidden/disabled in the UI, but authorization is enforced in domain services. The current theme setting remains browser-local. Personal-workspace wording is replaced with active workspace name and role.

## Migration and rollout checklist

1. Rotate any credentials previously committed to `.env.example`, and scrub them from Git history using your organization's credential-response process. The template now contains placeholders only; removing values from the latest file does not revoke them.
2. Take and verify a restorable backup of the development/pilot database. Inventory counts per historical owner and company links. Do not apply migrations to production as an exploratory test.
3. Rehearse `0000` + `0001` against a fresh isolated database and the populated legacy migration fixtures. The migration creates one organization and administrator membership per existing owner, backfills tenant IDs, verifies them through non-null/composite foreign-key constraints and records counts in marked migration audit baselines. It never merges users by email domain.
4. During a maintenance window with old writes stopped, set the correct `DATABASE_URL` and explicitly run `npm run db:migrate`. The pg migrator applies migrations in a transaction and journals them; reruns skip applied migrations. **No migration or seed runs at startup.**
5. Compare per-owner counts, record IDs, values and links against the backup inventory. Deploy this application together with the compatible schema; the previous owner-only application must not continue writing after tenant columns become mandatory.
6. Exercise live Neon sessions, workspace switching, verified invitation acceptance, TCP/TLS connectivity, membership revocation and concurrent requests on a disposable Neon development branch before release.
7. If rollback is necessary before new-model writes, restore the prior compatible app/database backup. After new-model writes, prefer forward fixes or a controlled restore with reconciliation. Do not drop tenant columns or audit history to force a rollback.

USD and UTC are preserved as explicit initial defaults. Currency storage/range, organization timezone editing, leads, activities, funnels, automation and analytics definitions belong to later milestones/M0 decisions and are unchanged here.

## Validation evidence

Automated PGlite tests exercise the same production policy/workspace/CRM services. They cover populated legacy backfill; tenant read/write/search/dashboard/link isolation; fixed permissions and unsupported scopes; own/team/organization visibility; reassignment and inactive membership; soft deletion; append-only audit; rollback on audit failure; deterministic pagination; and invitation identity, expiry, replacement and single use. PGlite does not establish Neon network/session behavior or real concurrent PostgreSQL locking. Local PostgreSQL adapter checks are recorded in the implementation plan when executed. Live Neon and operational backup/restore acceptance remain explicitly pending until performed.

### Reproducing the PostgreSQL and browser checks

Create a **disposable** PostgreSQL database whose name starts with `splash_phase1_`. Set `PHASE1_TEST_DATABASE_URL` securely to that database's connection URL (it is separate from the application's `DATABASE_URL`). Then run:

```sh
npm run test:postgres
npx playwright install chromium
npm run test:browser
```

Both optional suites reject a database name outside that prefix. They create fixture data and apply committed migrations, so do not point them at a live tenant database even if its name matches. The browser runner explicitly migrates the selected test database, starts a local test-only Neon HTTP simulator and the Next.js application on ports 4444/3100, and cleans up its processes. This is test harness initialization, not application startup migration behavior. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium binary if browser downloads are unavailable.

Executed evidence for this implementation: nine PGlite/validation tests; one local PostgreSQL 17 integration test (transactional migration replay, concurrent last-administrator protection, revoked membership and audit rollback); and one Chromium workflow (workspace administration, team creation, manual invitation acceptance, company creation, read-only UI, audit view, mobile navigation and revoked-selection recovery). Authentication in the browser suite is simulated using the installed SDK/proxy; real Neon sessions and email delivery are not claimed.
