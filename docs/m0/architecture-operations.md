# M0 architecture and operating proposals

The user confirmed the current MVP scope/roles and **PHP, Asia/Manila, elapsed calendar time**. Hosting, region, volume, budget, retention and service targets below remain proposals. This document provisions nothing and changes no application behavior.

## Recorded architecture decisions

| Decision | Choice and evidence | Consequence / review trigger |
| --- | --- | --- |
| ADR-01 Modular monolith | Retain Next.js/React, Neon Auth, one Postgres CRM database and Drizzle; shared domain services authorize Server Actions | Public APIs, workers and later integrations must use the same domain boundaries; do not create a second unrestricted write path |
| ADR-02 Tenant isolation | Organization ID + authoritative active membership + scoped queries, tenant-aware relation FKs, explicit assignment; private legacy owner migration | No sharing by email domain; source tests are not a live tenant inventory |
| ADR-03 Transactions | Current `pg`/Drizzle node-postgres supports interactive read/validate/write transactions. `workspaceService.within` serializes per tenant, including reads, then reads current membership | Correctness-first implementation may limit throughput; benchmark proposed pilot load. Narrow locks only with transaction/revocation/concurrency evidence |
| ADR-04 Audit and deletion | Business mutation and append-only audit in one transaction; logical deletion of critical records | Privacy erasure and retention require a separate reviewed policy; database administrators able to change triggers still require operational controls |
| ADR-05 Permission-sensitive reads | No persistent shared permission cache. React `cache` deduplicates workspace context only within a render/request; services recheck membership inside transactions | Session/membership changes must take effect on subsequent requests; no cross-request cache may broaden visibility |
| ADR-06 Publication/execution | Proposed immutable semantic versions, separate layout, pinned instances, expected revisions and idempotent commands | M3 implements schema, constraints, negative and concurrent tests; no historical visits invented from record creation dates |
| ADR-07 Durable work | Proposed transactional outbox plus a leased database-polling worker | M3 persists execution events and M4 implements processing; request completion and process restart cannot discard jobs |
| ADR-08 Pilot locale | Confirmed PHP + Asia/Manila display/local reporting dates + elapsed time; UTC instants in storage | Current USD/UTC app needs OPS-01 rollout before PHP pilot data; no automatic FX, business-hour rules or silent denomination change |

## M4 implementation note (26 October 2026)

[The M4 worker](../phase-4-automation.md) now implements fenced 120-second leases, renewal at each short processing transaction, six attempts and a two-connection sequential worker. A separate 20-second timer heartbeat/two-job concurrency were proposals, not delivered runtime settings. D16–D17 confirm named recipients and latest-at-first-processing semantics (including backlog), with persisted plans for retries. Hosting, region, budget, capacity and live acceptance remain open.

## Candidate hosting and scheduling decision

Recommended topology for selection: Vercel Node runtime for Next.js; Neon Postgres/Auth in a compatible nearby region; one **always-on** managed Node container worker (candidate Render), polling the same transactional database every five seconds. A sleeping/free worker tier cannot satisfy the proposed delivery-lag target. No hosting manifest is committed because provider, region, project identifiers, allowed origins, subscription capabilities and budget are not confirmed.

The alternative is a managed container host for both Next.js and worker if predictable process/connection limits or regional placement make that more suitable. Keep the domain/queue contracts the same. Do not add a timer to a Next.js request, rely on `after()` for durable delivery, or select a one-minute cron if the accepted queue-lag target remains 30 seconds.

The operations owner must record selected provider/accounts, runtime/worker region, budget ceiling, nonproduction isolation, secret management, custom domain/HTTPS/Neon trusted origins, worker scheduling/SLA, monitoring, deploy responsibility and recovery access before D08 is closed. Check current provider documentation/plan limits at selection time; this document makes no price or feature-availability claim.

### Proposed worker contract for M4

1. Persist outbox event and business changes in the same transaction; never acknowledge a movement before that transaction commits.
2. Poll available rows every five seconds. Claim a bounded batch with a short transaction and database lease (`FOR UPDATE SKIP LOCKED` or equivalent), then release transaction locks before processing. Do not hold a tenant lock across network work.
3. Proposed two-minute leases, heartbeat every 20 seconds and one-minute action execution limit. Recover expired leases after worker restart. Start with one worker/two concurrent jobs and measure before scaling.
4. Proposed six attempts total, retry delays 1s, 5s, 15s, 60s, 300s with jitter and persisted `availableAt`. Validation/permission failures are inspectable terminal failures, not endless retries. Re-evaluate these limits if future external providers require different semantics.
5. Enforce unique `(eventId, workflowVersionId, actionId)` effects. Task/notification creation and action-result recording must commit atomically. A crash between execution and acknowledgement must not create duplicates. Replaying retains original identity and records operator/replay provenance.
6. Recheck tenant, subject visibility and current authority of the originating actor/configuration owner before acting; revoked authority stops execution for inspection. No worker superuser bypass or arbitrary user code. Any different service-principal design needs explicit review before M4.
7. Surface queue age/depth, lease expiry, attempts, errors and failed events. Operator replay requires administrator authorization and must not rewrite event/version history. Stage-changing actions/loop controls remain release 1.1.

### Connection and deployment budget

Current app Pool maximum is five connections **per instance**, not five total. Proposed initial budget: at most five app instances × five connections + two worker connections + five migration/monitoring reserve = **32 connections** before provider pool multiplexing. Confirm that both hosting concurrency controls and the selected Neon plan support this bound; count warm/serverless instances and other clients. Do not assume a pooled URL eliminates transaction/connection limits. Migrations use an explicit command and a single migration connection; startup never migrates or seeds.

Keep production and disposable test branches/credentials separate. Use provider-supported TLS verification (explicit `sslmode=verify-full` where appropriate), stable cookie signing secret, least-privilege runtime credentials and separate migration/operations credentials. Configure provider Auth origins for the selected application URL. Never store credentials, invitation tokens, passwords or OTPs in this planning package.

## Proposed pilot and workload

| Item | Proposed envelope / acceptance setup |
| --- | --- |
| People | 2 tenant workspaces, 25 active members total, 10 concurrent sessions; include every fixed role and shared-team boundaries; one champion per workspace |
| Data | Across both tenants: 10,000 leads, 5,000 contacts, 1,000 accounts, 5,000 opportunities, 50,000 activities, 100,000 journey events; include skewed large tenant, duplicates, inactive members and deleted records |
| Traffic | 10 requests/second sustained for 30 minutes after warmup; brief 20 requests/second burst for 60 seconds; 70% list/search/detail, 20% CRM writes, 10% transitions once M3 exists |
| Pilot duration | 10 business days after pre-pilot acceptance; review incidents/feedback daily, reconcile records/metrics at close |
| People actually assigned | None by this document; product and operations owners must name responsible people and confirm availability |

These are proposed load-test/pilot envelopes, not observed production volume or staffing commitments. The current per-tenant serialization must be evaluated under these conditions, including slow queries and revocation during active writes.

## Quantified service and recovery targets

Targets are proposed acceptance thresholds, not measured results or provider promises.

| Measure | Proposed target | Measurement and release evidence |
| --- | --- | --- |
| Lists/search/detail | p95 < 2 seconds; server error rate < 1% | End-to-end browser timings over representative 50-row pages at proposed workload, both tenant scopes, warm and cold cases reported separately; include region/database latency |
| Stage command | p95 acknowledgement < 1 second after request reaches app; no duplicated movement | M3 at proposed workload, expected conflicts reported separately from server errors; client navigation/render time also measured |
| Queue delivery | p95 event-to-task/notification completion < 30 seconds under normal load | M4 oldest-event age, processing latency and restart/replay fixture; sustained oldest eligible event > 60 seconds triggers investigation |
| Availability | 99.9% per calendar month | Authenticated synthetic probes from a permitted test identity plus HTTP/domain health, excluding no unagreed maintenance; 30-day error budget 43.2 minutes; define provider outage accounting before pilot |
| Recovery point (RPO) | ≤ 1 hour of data loss | Verify provider PITR/log recovery behavior and subscription; restore an isolated copy and compare last committed business/audit/outbox markers, not just backup job success |
| Recovery time (RTO) | ≤ 4 hours from incident declaration to validated service restoration | Timed rehearsal including database, application config, Auth/provider dependency access, record reconciliation and worker replay |
| Backup candidate | Daily restorable snapshot plus provider PITR/log protection capable of RPO ≤ 1 hour; candidate 7-day recovery window | Daily snapshot alone cannot meet one-hour RPO. Confirm actual provider support, encryption, restore access and regional dependency before acceptance |
| Restore rehearsal | Before pilot, after material migration, and monthly during pilot/early release | Restore to isolated environment, validate tenant counts/links, append-only audit, one active journey/visit and no duplicate jobs; record timestamps, operator and reconciliations |
| Deployment rollback | Before new-model writes: compatible app/database restore; after new writes: forward fix or controlled restore/reconciliation | Record compatibility window and write freeze; never drop tenant/audit/journey columns merely to make old code run |

## Retention and privacy proposals

Proposed operational logs: 30 days, redact secrets/tokens and minimize personal data. Proposed completed automation diagnostic payloads: 90 days after completion, with durable business/audit provenance retained according to the eventual business policy. Proposed backup recovery window: at least seven days, subject to plan capability and retention agreement.

**Business, activity, audit and journey retention/erasure periods remain unresolved.** Current logical deletion is not erasure, and audit append-only triggers mean an erasure plan needs an explicitly designed, authorized process. No automatic purge or GDPR/legal compliance claim is introduced. Before using real pilot data, the data owner must decide retention by category, lawful basis/access, erasure/anonymization, legal holds, backup expiry, provider identity retention and how a restore reapplies approved erasure records. Confirm provider residence/retention requirements with the selected region; no region is inferred from the confirmed Asia/Manila timezone.

## Pre-pilot evidence checklist

- [ ] Named product, technical, operations and data owners; actual hosting/region/budget and pilot volume confirmed.
- [ ] PHP currency provenance and display/input timezone rollout completed; no mixed-denomination aggregate.
- [ ] Disposable Neon session/verification/reset/revocation and invitation journey evidence; no unverified protected-route gap.
- [ ] Migration inventory, negative tenant tests, concurrency, live transaction/TLS behavior and connection budget verified.
- [ ] Timed backup restoration and RPO/RTO evidence; selected provider capabilities documented.
- [ ] Scoped metrics reconciled against hand-calculated fixtures; real browser/keyboard/mobile pilot scenarios reviewed.
- [ ] Durable worker crash/replay, permissions, leases and failed-job inspection demonstrated before M4 acceptance.
- [ ] Retention/privacy and incident-response responsibility confirmed before real pilot data is loaded.
