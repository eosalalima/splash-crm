# M3: funnel design and execution

Implemented 22 October 2026 against the current Develop workspace. This phase adds application funnel design/execution using the approved M0 template. Local source/tests are not a live Neon migration, production deployment, recovery rehearsal or M4 worker.

## Application workflow

1. Open **Funnels** in the sidebar. Administrators create the standard sales template or clone another funnel into a separate draft.
2. In the designer, select a stage to edit its name, probability, elapsed-hour target, responsible role, required standard fields and completed opportunity activity types on entry/exit. Add/remove/reorder intermediate stages with keyboard-accessible controls. Entry and terminal kinds are fixed; drafts contain at most 20 stages.
3. Save the draft before publishing. Draft saves require the expected draft revision; stale editors must refresh. Publication validates names/IDs, one first entry, one terminal per outcome, probabilities, reachable stages, supported fields/activities, configured reasons and ordered transition edges. Publication snapshots semantic definition and layout separately; later saves cannot rewrite it.
4. Open an opportunity and use **Funnel journeys → Enroll opportunity**. Select a published funnel version. For older publications or catalogs beyond the initial 50 choices, search Funnels/its version history and use the explicit version reference. Enrollment requires edit permission and current opportunity visibility; only one active journey per opportunity is allowed.
5. Open **Pipeline** through a published version or an opportunity journey. Each board shows exactly one immutable version, its permitted cards and an as-of timestamp. Search/pagination return up to 50 journeys across all columns, not an arbitrary per-column cutoff.
6. Use **Move to** and **Move** with keyboard controls. Dragging a card selects an allowed destination; the user confirms it through the same form. The card stays in its current column until the server commits, so a rejected action has no optimistic position to undo. Forms preserve the selected destination and corrections after validation errors rather than resetting to the first option. Outcome reasons come from that pinned version's configuration; Refresh board retrieves the current revision after a conflict.
7. Inspect **Journey history** for version, actor, timestamp, source/target, reason/comment, revision, command/correlation reference and visits. New committed movement audit entries also appear in existing Customer 360 event metadata. Administrator audit retains the normal before/after records.

Archived funnels reject new drafts/publications/enrollments but existing journeys may finish against their pinned version. Definitions with history are archived rather than deleted. Cloning copies the latest publication (or an unpublished draft) to a new funnel; it copies no instances/history.

## Approved defaults and explicit M3 choices

The standard template retains the user-approved baseline:

| Stage | Kind | Probability | Target elapsed hours | Default entry field |
| --- | --- | --- | --- | --- |
| Lead | Entry | 10% | 48 | None beyond existing opportunity validation |
| Qualified | Intermediate | 30% | 72 | None |
| Proposal | Intermediate | 60% | 120 | Expected close date |
| Won | Successful terminal | 100% | None | None |
| Lost | Unsuccessful terminal | 0% | None | Configured outcome reason |

Default edges follow Lead → Qualified → Proposal → Won, with Lost reachable from every nonterminal stage. This MVP is ordered execution; backward/re-entry transitions, arbitrary branching and paused/deferred states are not offered. A terminal journey remains immutable; an authorized user can explicitly enroll a new journey afterwards. This never bypasses one-active-instance uniqueness.

The separately unapproved completed-call gate is **not enabled by default**. Administrators can explicitly configure completed tasks/calls/meetings/manual emails/notes as entry/exit gates. Only nondeleted, completed, visible activities linked directly to the opportunity satisfy a gate; hidden/incomplete/deleted activities do not leak data or satisfy it. Required value means greater than zero; other required standard fields must be non-null/nonempty. Rules apply on enrollment entry and on both source exit and destination entry for movement.

Stage responsibility uses the prototype's proposed role defaults as editable guidance, not a new permission grant. Existing fixed-role policy applies: Administrator configures/publishes/archives/clones; Administrator, Manager and Representative enroll/move only opportunities permitted by their active own/team/organization scope and edit permission; Read-only browses its existing organization scope without mutation. Every action/data operation checks authoritative membership again.

Journey state (`active`, `successful`, `unsuccessful`) is separate from opportunity status and the preserved legacy enum. Terminal movement does not silently update opportunity status, probability, customer lifecycle or legacy stage. Automatic status synchronization remains a product decision. Once a journey exists, direct legacy-stage edits are rejected and the record form retains the old value as provenance; stages move through the pipeline service. Logical deletion is blocked while an active journey exists.

Current opportunity amounts still use the existing **USD** formatter/storage convention. This M3 work does not relabel existing amounts as PHP or perform the separately tracked denomination/timezone rollout. New journey/history timestamps explicitly display Asia/Manila while instants remain UTC. Aging uses elapsed hours including weekends/holidays, with a strict `age > target` threshold; zero/no target is untracked. Unknown legacy entry times remain unknown.

## Data and execution boundaries

- `crm_funnels`: mutable draft, draft revision, metadata, separate layout and archive marker.
- `crm_funnel_versions`: immutable publication number and JSON semantic snapshot containing typed stage/transition definitions, plus separate layout snapshot. Stage/transition definitions live inside the immutable snapshot rather than mutable child rows. No arbitrary executable conditions/actions are accepted.
- `crm_funnel_instances`: organization/opportunity/funnel/version identity, current stage, outcome/state, revision, enrollment/completion observation and baseline marker.
- `crm_stage_visits`: version-bound stage entry/exit instants and entry actor; an open visit can be closed once, but its identity/entry data cannot be rewritten. One open visit per instance and one visit per stage in this ordered MVP.
- `crm_transition_events`: immutable enrollment/movement events with unique command key and committed revision, expected revision, actor/source/correlation/reason/comment.
- `crm_outbox_events`: one durable pending event per committed enrollment/movement, written in the same transaction. It carries the pinned version, subject, actor, correlation and committed stage/outcome. Normal destinations emit `stage.entered`; terminal destinations emit `journey.completed` with the terminal stage ID. M4 must include terminal destinations when interpreting stage-entry triggers. **No worker, workflow execution, task automation or notification delivery is implemented in M3.** M4 must introduce leases/retries/processing and preserve these IDs.

The existing workspace-row transaction lock serializes current membership with CRM/execution commands. Tenant-aware FKs bind opportunities, funnels, versions, instances, visits and events. Partial unique indexes enforce one active instance per opportunity and one open visit per instance. Database triggers reject published-version/transition mutation/truncation, visit deletion/truncation or entry rewriting, instance-anchor changes, revision jumps, and stages/transitions outside the pinned definition. Normal runtime writes still use the authorized domain service; privileged database operators are not a substitute for application authorization.

### Movement transaction

1. Authenticate/select the workspace on the server; derive actor and tenant from authoritative context, not hidden tenant fields.
2. Lock workspace, recheck active membership/edit permission, and load the visible nondeleted opportunity and version-bound instance.
3. Check command identity before revision/state checks. Same key and identical payload returns its original result, including after terminal completion; key reuse with different payload is rejected. Current authorization/visibility is still required on retries.
4. Check expected revision, active state and allowed versioned edge. Validate configured outcome reason and all source-exit/destination-entry fields/activities.
5. Close exactly one open visit, update stage/state/revision, open the next visit or record an immediately closed terminal visit, append transition, enqueue the durable event and write audit in one database transaction.
6. Return authoritative state. A rule, audit or outbox failure rolls back every preceding write; concurrent stale commands return an actionable conflict. Public Server Actions use source `ui`; future trusted callers must use the same service rather than raw table writes.

Enrollment and publication also have command-key idempotency. Draft saves use expected revisions. Publishing an unchanged draft with a distinct command key is an explicit new publication, not content-addressed deduplication. UI command keys survive validation errors/retries; successful navigation/revalidation supplies a new command reference for the next action.

## Legacy migration and release procedure

`0003_funnel_design_execution.sql` creates the new structures and, for each tenant with nondeleted existing deals, creates an archived **Legacy sales pipeline** publication and baseline instances matching the current five-value legacy stage. Existing deal IDs, URLs, amounts, related records and independent opportunity status are preserved. Soft-deleted deals are excluded from automatic enrollment and retained as existing deleted records.

Legacy nonterminal stages have zero probability/target and no new gates; Won retains a terminal 100% default and Lost 0%. These are explicit migration configuration defaults, not estimates of historical probabilities or durations. Each current stage receives one marked visit with `enteredAt = NULL`. Closed baseline observations use migration time only as an observation marker; old successful/unsuccessful completion dates/reasons are unknown. No transitions/outbox records are invented or retroactively fired. One marked per-tenant migration audit records the instance count. Later real movement creates genuine timestamps/events while leaving the unknown baseline entry untouched.

Existing active legacy journeys can finish through the archived version. They are not silently moved to the approved standard template or upgraded to a newer version. Any future instance migration needs an explicit mapping and audit; it is not offered by this release.

Before deployment:

1. Rehearse a restorable backup and tenant/deal/amount/link/status inventory on a disposable branch. Confirm M0 identity/hosting/retention decisions separately.
2. Run `npm install` and `npm run db:migrate` explicitly against that branch. Nothing migrates/seeds automatically on startup.
3. Reconcile active legacy deal/instance counts, stage mapping, open visits, unknown entry times, unchanged values/status, baseline audit and absence of synthetic transition/outbox events. Verify replay uses the migration journal.
4. Exercise real Neon sessions, scoped board/history/actions, publication and native keyboard/drag flows. Run competing enrollment/movement and audit/outbox rollback checks against the selected adapter.
5. Stop older application writes while deploying the compatible schema/application pair. Old binaries do not enforce managed-stage and active-journey deletion restrictions. Prefer forward fixes or an explicitly reconciled restore after new execution writes.
6. Inspect pending outbox growth; M4 processing is not deployed by this phase. Do not delete execution history or pretend automation has run.

No live Neon migration, hosting deployment or backup restoration was performed during this implementation task. The M0 verified-session gap remains a separate pre-pilot acceptance item.

## Local verification

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npx drizzle-kit generate --name=m3_schema_check` (expected no changes).

Use a disposable PostgreSQL database named `splash_phase1_*` and set `PHASE1_TEST_DATABASE_URL` to run `npm run test:postgres`. The existing name safeguard is retained. Run the PostgreSQL suite and browser suite **sequentially** because the PostgreSQL failure-injection tests temporarily install database triggers. Never point these suites at a live CRM database.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` uses the actual Next.js application, installed Auth SDK and local PostgreSQL, with test-only Neon identity responses. It does not establish live provider/session/email behavior.

PGlite/domain coverage includes approved defaults; invalid graph/field/reference/terminal rules; populated migration and unknown baselines; publication/draft/clone/archive behavior; immutable versions and visits; one-active enrollment; entry/exit field/activity validation; configured reasons; exact command replay/key misuse; terminal/outcome separation; audit/outbox rollback; scoped search/board/history and revocation; deterministic pagination and literal wildcard search. Real PostgreSQL adds competing enrollment/movement, duplicate-command races and transactional outbox rollback. Browser coverage exercises the designer/publication/enrollment/pinned board/history journey, missing fields, outdated submitted revision, keyboard/native drag, reason correction, version pinning, read-only controls and mobile navigation.

### Recorded results (22 October 2026)

- Lint, TypeScript and production Webpack build pass; all 21 prerendered route shells complete, including Funnels, Pipeline and Journey history.
- **25 validation/PGlite tests** pass (including nine M3 definition/domain/migration cases).
- **Three PostgreSQL 17 integration tests** pass. The M3 case covers competing enrollment, competing expected-revision movement, simultaneous identical-command replay, one open visit and rollback on outbox failure.
- **Four Chromium application journeys** pass, including the new M3 flow and prior activity/CRM/workspace regressions. The M3 stale-command assertion submits an outdated client revision; it also checks that correcting a missing outcome reason preserves the Lost destination.
- An additional **production-build two-tab smoke check** passes using the built Next.js server, the same browser/session in two tabs, local PostgreSQL and simulated Neon identity: first-view commit, stale-view rejection, Refresh board recovery and subsequent valid movement. This is separate from the development-server browser suite.
- Schema generation reports no changes; documentation links and `git diff --check` pass. The application screenshot was visually reviewed, and the browser journey checks mobile overflow/navigation.

All database/identity activity above used an isolated disposable local database and the test HTTP identity simulator. No real Neon migration/session/email/backup-restoration/deployment acceptance is inferred. The temporary production/dev servers and disposable database container are stopped after verification.
