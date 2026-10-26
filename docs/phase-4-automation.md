# M4: basic stage-entry automation

Implemented locally on 26 October 2026. This milestone adds application code, an additive migration and an independent Node worker. It does not deploy hosting, migrate a live Neon database, establish live identity acceptance, complete M0/M5 or authorize real pilot data.

## Approved processing policy

The user selected these policies in this implementation chat:

- Each workflow selects one named active same-workspace member. Task actions have an integer due-hour offset; due time is the original transition/stage-entry instant plus elapsed hours (0–8,760). Existing backlog can therefore create overdue tasks. Notifications go to that same configured member. No automatic reassignment occurs if access is lost.
- On first successful evaluation, use the latest published version of each nonarchived matching workflow and current opportunity status/value/probability/expected-close fields. This includes previously pending M3 events. This choice intentionally permits new workflows to act on existing backlog.
- Persist the evaluation time, field snapshot, selected immutable workflow version IDs and condition results. Retries/replay retain this plan and successful effect identities; a later publication or opportunity edit cannot add/change actions during recovery. An event evaluated with no workflows does not acquire workflows later.

This latest-at-processing policy supersedes any inference that workflow versions or condition fields are snapshotted during M3 movement. M3 event payloads and identities are preserved. Funnel instances remain pinned to their original funnel publication; workflow triggers select that exact publication and stage.

## Application workflow

Administrators open **Settings → Manage automation** (`/settings/automation`). Search/paginate published funnel versions, choose a stage (including Won/Lost), a named member, conditions and actions. Publish directly from the form; editing publishes a new immutable workflow version using an expected revision and idempotent command key. Publication validates the stage reference, active recipient and typed definition. Archived workflows cannot be edited and are excluded from new evaluations. Archiving stops unfinished already planned actions with a visible failure; it does not undo completed effects or rewrite history. Archived workflows are not restored by replay.

Each workspace supports up to 100 active workflows to bound initial event evaluation. Conditions are an AND list (up to ten): opportunity status equals/does-not-equal, value in integer minor units at-least/at-most, probability at-least/at-most, and expected-close present/absent. Value conditions use the existing stored denomination, not FX or a PHP relabel. An empty list matches every entry to the selected stage. Up to ten actions create a normal-priority open task linked to the opportunity, or an in-app notification. Titles/messages are literal text, never executable templates or arbitrary code.

The page shows queue totals/oldest timestamps, event identity, attempts, availability/lease state, sanitized failures, retained evaluation, published versions, workflow runs and action provenance. Lists have deterministic history pagination. Administrators can replay only failed events, retaining the original plan and successful actions; replay resets the six-attempt budget and writes an audit event with the previous attempt count/error and operator. Resolve access/worker failures first. An archived pinned workflow remains stopped after replay; it requires a separately configured future event/workflow rather than rewriting its original plan.

All active members can open **Notifications** (`/notifications`). Only their own notifications whose opportunities remain currently visible and nondeleted are returned or markable as read. Inbox refresh is explicit; no realtime or email delivery is claimed. Tasks use the existing Activities UI. Automated effects write deal audit metadata, so Customer 360 can show real action provenance and linked activities.

## Durable execution

`0004_m4_basic_automation.sql` adds workflow/version/run/action/notification tables and extends `crm_outbox_events` with attempts, availability, lease token/expiry, completion/error and a one-time evaluation plan. Tenant-aware FKs and unique event/version/action identities prevent cross-tenant references and duplicate effects. Triggers protect workflow versions, action provenance, event payloads, initialized plans and run identity; notification content is immutable with only its first read acknowledgement mutable.

The worker handles both `stage.entered` and `journey.completed` as entry into the event transition's destination stage. It reads authoritative transition/instance links, not a caller-controlled payload subject. It does not change stage, opportunity status, probability or customer lifecycle.

1. Claim one ready event with a short `FOR UPDATE SKIP LOCKED` transaction. Increment attempts, assign a fresh UUID fencing token and a 120-second database lease. Expired leases can be reclaimed. Exhausted expired work becomes failed.
2. Acquire the existing tenant lock before event/action processing, using the same ordering as membership changes and replay. Recheck the originating actor's current edit permission and subject visibility. Select and persist the initial evaluation plan atomically with pending/skipped runs.
3. Each action transaction validates the current fencing token/lease and renews it. Recheck the original actor, active administrator publisher/configuration authority, nonarchived workflow and named recipient's current subject access. Task recipients also need create permission; Read-only members may receive notifications but not task ownership through automation. Shared `authorizeWorkspace` and `visibilityScope` enforce the same policy boundary as web commands.
4. Create the task/notification, insert its unique action receipt and write audit in one transaction. Commit effects before acknowledging the event. A crash after effect commit leaves the receipt, so another worker skips that effect. A crash before commit leaves none of those writes.
5. Mark completed runs and acknowledge the event in separate fenced transactions. Transient errors retry at approximately 1s, 5s, 15s, 60s and 300s with up to 20% jitter (six total attempts). Access/validation-policy failures become inspectable failed events immediately. Stale workers cannot update a new owner's lease or acknowledgement.

Processing is sequential per worker with a two-connection pool. Leases renew at every processing transaction, rather than a separate timer heartbeat; actions are local database operations with no external network side effects. Queries have 15-second statement and 3-second lock timeouts; the process pool also has a 20-second idle-in-transaction timeout. Transactions never hold a tenant lock across email/API work. SIGINT/SIGTERM stop polling after the current event; an abrupt process loss recovers through lease expiry. Logs avoid credentials and raw database errors. Queue/error diagnostics are available in the administrator page; managed uptime/alerting remain deployment responsibilities.

## Local run and deployment preparation

Use a disposable database for rehearsal. Set `DATABASE_URL` explicitly to that isolated database in the shell; the worker loads the project's environment files only for otherwise unset values. The worker requires no Neon user login or public HTTP endpoint, and never starts from a web request.

```text
npm run db:migrate
npm run worker:automation -- --once
npm run worker:automation
```

`--once` attempts at most one claim/process cycle and is useful for an isolated smoke test. Normal mode polls idle queues every five seconds and drains ready events without waiting between them. `npm run dev`, `npm start` and the worker do not auto-migrate or seed. Run migration once with migration credentials before deploying the compatible application/worker pair.

Before a live rollout:

1. Confirm provider/region/budget/owners and connection capacity (two worker connections per process, in addition to app pools). Select an always-on process supervisor with restart policy, logs, shutdown grace and monitoring. No provider or paid plan has been selected/provisioned here.
2. Back up/rehearse restore and inventory pending outbox events. Apply the additive migration on a disposable Neon branch and verify journal replay, tenant links and immutable history. M3 baseline migration still invents no transition/outbox history.
3. Review workflow recipients, offsets and existing queued events before starting the worker: the approved policy intentionally processes old pending events with the latest matching workflows. Do not delete or relabel old events to avoid inspection.
4. Deploy compatible code and worker against the same database; validate actual Neon transactions, leases, competing workers, crash/replay and role revocation. Use least-privilege runtime credentials; reserve schema/trigger changes for migration operators.
5. Exercise real signup/verification/session/invitation flows, timed backup/restore and queue-lag/load targets. Check the PHP/Asia-Manila rollout before accepting PHP pilot data. These gates remain separate from local simulated identity tests.

Future work includes richer workflow actions/triggers, branching and stage-changing loop/depth controls (1.1), external delivery and M5 reporting/release. Existing stage revisits remain a separate schema/execution enhancement.

## Verification

Browser tests set `SPLASH_BROWSER_TEST_BUILD=1`, isolating Next output/locks under `.next/browser-tests` so a developer server can continue running. The normal application retains `.next`; test type directories are included in TypeScript configuration. The framework-generated AGENTS feedback block is retained.

Recorded local results:

- `npm run lint`, `npm run typecheck`, production `npm run build` and `git diff --check` pass. The build generates 23 route shells, including Automation and Notifications.
- `npm test`: 35 tests pass, including seven M4 condition/domain cases covering latest version/current fields, existing queue processing, immutable evaluation, task due time/ownership, terminal triggers, crash after effect/before acknowledgement, stale lease fencing, retry exhaustion, transactional audit rollback, recipient/publisher access changes, scoped reads and controlled replay.
- `npm run test:postgres`: four PostgreSQL 17 cases pass, including competing claims, expired lease recovery, stale/duplicate worker processing and exactly one committed task/notification. Migration journal replay and prior CRM/funnel concurrency cases pass against the final migration on a fresh local database.
- `npm run test:browser`: five Chromium journeys pass, covering M4 typed publication, task/inbox/read flow, read-only restrictions, archive failure/replay, and prior activity/CRM/funnel/workspace regressions. Desktop 1440px, tablet 768px and mobile 390px layout checks pass; desktop/mobile screenshots were visually inspected. Browser authentication uses the local Neon simulator.
- Schema generation reports no changes; local documentation links resolve. `npm run worker:automation -- --once` also starts and exits successfully against the isolated local database.

 Tests use PGlite plus disposable local PostgreSQL 17 and simulated Neon HTTP identity, never a live CRM database. Production build verification establishes compilation/prerendering, not deployment or real Neon acceptance.

The temporary test servers and isolated PostgreSQL cluster were stopped after verification. No live database migration, real email/session acceptance, hosted worker, backup restoration or production deployment was performed. Changes remain local and uncommitted.
