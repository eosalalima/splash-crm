# ERIC CRM and Funnel Platform Implementation Plan

Prepared 20 October 2026 from the September 2026 BRD version 1.0 draft and the splash-crm source review. Scope and estimates below are implementation recommendations, subject to product decisions.

## Delivery recommendation

Deliver the BRD section 66 MVP as a coherent product: shared CRM, visual funnel design, immutable published versions, validated funnel execution, activities, basic automation and reliable analytics. Use section 72 as the release acceptance gate. The broader section 6 scope should be delivered incrementally and explicitly tracked.

## Current application

The application uses Next.js 16.4.2 App Router, React 19, TypeScript, Tailwind, Neon Auth, Neon Postgres and Drizzle. Before Phase 1, capabilities were personal owner-scoped CRUD, a fixed five-stage deal enum, dashboard counts and PGlite tests. Phase 1 adds organizations, membership/teams, fixed role policies, scoped transactional CRM, invitations, audit, soft deletion and pagination.

Remaining major gaps are leads/conversion, activities, configurable funnels, historical journey execution, automation, richer reporting and integrations. USD formatting and integer money storage remain explicit existing defaults for review. Physical deletion and the 200-record list cutoff have been replaced in Phase 1. Source inspection does not constitute live authentication or database verification.

## MVP scope

- Leads, contacts, customer accounts and opportunities with manual assignment.
- Products, lead sources, activities and a basic Customer 360 timeline.
- Organization membership, teams, fixed role presets and own/team/organization visibility.
- Ordered visual funnel editor with configurable stage rules, immutable publication and one cloneable template.
- Funnel enrollment, validated transitions, complete stage history and a visual pipeline board.
- Stage-entry automation that creates tasks and in-app notifications.
- Funnel conversion, drop-off, aging, pipeline and basic role dashboards.
- Audit trail, logical deletion, pagination and operational readiness.

Conditional branching, configurable scoring and assignment, campaigns, custom fields, department visibility, custom roles, user-facing import/export, APIs, webhooks and richer workflow actions follow in release 1.1. Attachments, provider communications and advanced reporting follow in 1.2. AI and the BRD section 7 future capabilities remain later work. Preserve section 8 exclusions.

## Architecture

Retain a modular application and one Postgres database. Introduce server-only modules for access, CRM, funnels, activities, automation, notifications, audit and reporting. Server Actions and later REST endpoints call shared domain services with authorization and validation at the data boundary.

Retain Cache Components and authenticated Suspense boundaries. Read authoritative sessions and membership at request time. Start with uncached permission-sensitive queries; later caches must include organization and visibility scope and invalidate when permissions change. Read installed Next.js documentation before framework-dependent changes.

Use small client components for the designer and board. Include keyboard stage movement, pending feedback, validation, loading, empty and error states.

Use atomic transactions for conversion, publication and stage movement. Assess whether the current neon-http adapter supports each required transaction pattern; use supported atomic SQL/batching or a transactional adapter for read/validate/write operations. Do not assume interactive transaction support.

Persist an outbox event in the business transaction and process it through a durable worker. Jobs require leases, bounded retries, idempotency, failure inspection and controlled replay. Select hosting and scheduling during inception; background work must survive request completion and restarts.

## Data model

Distinguish the tenant organization from a customer company/account.

| Domain | Proposed records |
| --- | --- |
| Access | organizations, memberships, invitations, teams, team_memberships, roles, permissions |
| CRM | leads, contacts, companies, opportunities, products, opportunity_products, lead_sources, tags, record_tags |
| Lifecycle | customer status and explicit lead conversion links to contact/account/optional opportunity |
| Activities | activities with type, owner, due date, priority, status, outcome and validated related records |
| Design | funnels, funnel_versions, stage_definitions, transition_definitions |
| Execution | funnel_instances, stage_visits, transition_events |
| Automation | workflow_definitions, workflow_versions, outbox_events, automation_runs, action_runs, scheduled_jobs |
| Operations | notifications and append-only audit_events |
| Later configuration | campaigns, custom fields, assignment/scoring rules, duplicate merge records, API credentials and webhook deliveries |

Business records carry organization_id. Assigned user/team are separate from tenancy. Use tenant-aware foreign keys, validated membership and scoped queries. Contacts may have multiple opportunities and customers multiple funnel instances. Enforce one active funnel instance per opportunity by default (BR-004).

Separate opportunity status from funnel stage and journey outcome. Require configurable reasons for abnormal exits. Published versions and historical transitions are immutable. Soft-delete critical records; agree privacy erasure and retention separately.

Store UTC timestamps and organization timezone. Select initial currency explicitly: the BRD uses PHP examples while the starter formats USD. Use integer minor units with a sufficient safe range or fixed precision numeric storage. Do not aggregate mixed currencies without a conversion policy.

## Funnel execution contract

1. Authenticate and authorize the actor and subject in the organization.
2. Load the active instance and immutable version; check expected instance revision.
3. Validate the allowed transition, required fields/activities, entry/exit rules and outcome reason.
4. Atomically close the stage visit, append movement history, open the next visit or terminate, update revision, write audit and enqueue events.
5. Return authoritative state and actionable validation errors; revert optimistic board state after rejection.

Commands require idempotency keys. Concurrent movement must produce one committed transition and one conflict, not two active visits. APIs and automation use this same service. History records actor, stages, timestamps, reason, version, source and correlation ID.

Publication validates reachable stages, entry and terminal structure and referenced fields/actions. Draft edits create new versions; existing instances remain on their original version. Any future instance migration requires explicit mapping and audit. Archive referenced definitions instead of deleting them.

## Sequenced delivery

Illustrative estimate assumes two full-time engineers with shared QA, product and design support. Total sequential MVP range is 18–25 working weeks. These are planning ranges, not committed dates; re-estimate after the access migration and funnel prototype.

| Milestone | Duration | Deliverables and exit gate |
| --- | --- | --- |
| M0 Inception | 1–2 weeks | Agreed MVP, role matrix, metric definitions, data dictionary, wireframes, transaction and worker decisions |
| M1 Shared workspace foundation | 3–4 weeks | Organizations, membership, teams, roles, scoped access, audit, logical deletion, tenant migration; isolation and migration tests pass |
| M2 CRM operating workflow | 3–4 weeks | Leads, conversion, accounts, contacts, opportunities, products, sources, activities and Customer 360; capture-to-opportunity workflow passes |
| M3 Funnel design and execution | 5–7 weeks | Visual editor, stage rules, publication, versions, instances, history and board; invalid, stale and concurrent movement checks pass |
| M4 Basic automation | 2–3 weeks | Stage-entry conditions, task/notification actions, outbox, worker and retries; replay creates no duplicate actions |
| M5 Analytics and release | 4–5 weeks | Conversion/drop-off/aging/pipeline, dashboards, browser checks, operational readiness and pilot; section 72 acceptance passes |

Dependencies are sequential: access precedes shared CRM; CRM precedes execution; execution history supports analytics and automation. Worker infrastructure must be ready before M4.

### M0 Inception

Agree MVP versus initial-release scope, role permissions, visibility, terminology, currency, timezone, calendar, user invitation flow, pilot volume and hosting. Prototype the standard sales funnel and board. Establish quantified performance, availability, backup, restore and retention targets. Build a backlog mapped to BRD FR and BR identifiers.

### M1 Shared workspace foundation

**Phase 1 implementation status (21 October 2026): implemented in code; release/deployment verification pending.** Phase 1 is interpreted as M1 in this plan. See [Phase 1 foundation decisions, migration and verification](phase-1-foundation.md) for the concrete role matrix, transaction choice and rollout checklist.

- [x] Tenant organizations, active memberships, fixed role presets, teams and own/team/organization visibility.
- [x] Server-validated workspace selection, secure invitation acceptance/revocation, and administrator/member/team UI.
- [x] Policy permissions for view/create/edit/delete/assign/approve/export/configure; unsupported department/custom scopes denied. Business approval/export features remain in their scheduled later scope.
- [x] Existing CRM queries, mutations, dashboards and company links use tenant/visibility checks; assignment is distinct from tenancy.
- [x] Soft deletion, deterministic record/company-option pagination, and active-workspace wording.
- [x] Atomic before/after audit writes, administrator audit viewer and database append-only protections.
- [x] Private organization-per-owner migration, populated legacy fixtures, tenant-aware constraints and explicit transactional migration command.
- [x] Identity-provider login audit support assessed: no fabricated login events; provider feed/retention validation requires the live Neon project.
- [x] Local verification: nine PGlite/validation tests, one PostgreSQL 17 transaction/concurrency integration test and one Chromium workspace/permission workflow pass. Lint, TypeScript and production-build results are recorded in the task report.
- [ ] Apply/rehearse against a disposable Neon branch; verify real sessions, transactions/concurrency, backup restoration and deployment inventory. No live database migration is implied by source tests.

M0 product decisions are not marked complete by these implementation defaults. M2–M5 remain untouched.

Validate active organization context from server membership. Implement view/create/edit/delete/assign/approve/export/configure permissions. Start with Administrator, Manager, Representative and Read-only presets, explicitly mapping other personas. Deny unsupported department scopes rather than broadening access. Write audit alongside mutations and identify identity-provider login audit support. Adapt every existing query, mutation and company link; add pagination and update personal-workspace wording.

### M2 CRM operating workflow

Implement the section 13–16 fields, lifecycle, products, expected close, probability, source and notes. Lead conversion must be atomic and idempotent, support matching existing records, and retain conversion provenance. Add activities and timeline events. Manual email records do not imply mailbox synchronization. Add administrator product/source configuration, duplicate warnings and simple tags.

### M3 Funnel design and execution

Implement stage add/reorder/configuration, probability, target duration, responsible role and required standard fields/activities. Store layout separately from execution semantics. Publish and enroll before enabling dragging. Route every movement through the execution contract. Add outcomes and reasons, version-aware history, cloning, archiving and aging thresholds. Do not fabricate historical transitions.

### M4 Basic automation

Use typed triggers, operators, fields and actions with no arbitrary user code. Snapshot workflow versions and record execution provenance. Deduplicate by event, workflow version and action identity. Constrain automation permissions, verify tenant boundaries and surface failures. Introduce loop/depth controls before stage-changing or cross-funnel actions in 1.1.

### M5 Analytics and release

Use version-aware reporting and preserve visibility in aggregates and drill-downs. Verify hand-calculated metric fixtures, live Neon sessions and concurrent transaction behavior. Rehearse worker restart, event replay, migration and restoration. Run a small organization pilot before expanding.

## Reporting definitions

- Funnel entries: distinct instances enrolled during the selected entry-date cohort, grouped by version.
- Funnel conversion: converted instances divided by all cohort entries; show active instances and observation cutoff.
- Stage conversion: distinct instances taking a selected outgoing transition divided by distinct instances entering its source stage in the cohort.
- Drop-off: unsuccessful terminal instances divided by entries, attributed to the exit stage. Decide whether deferred/backburner means paused or terminal.
- Stage duration: completed visits; show open-visit age separately and define re-entry counting.
- Aging: current age against versioned thresholds with an agreed elapsed-hours/business-days calendar.
- Pipeline: open opportunity amounts in permitted scope; weighted pipeline uses effective probability with explicit override precedence.
- Cycle time: enrollment to successful completion. Keep cohort reports separate from period activity and revenue reports.

Capture raw visits and transitions first. Begin with indexed SQL, adding summaries only after measurement. State report freshness, date basis, organization timezone and version. Exclude synthetic migration baselines from claims about historical duration.

## Migration and rollout

1. Inventory current data and rehearse a restorable backup on a development branch.
2. Create one private organization per existing owner unless an approved map explicitly shares records. Do not combine users by email domain.
3. Add nullable tenant columns, backfill and verify counts, links and memberships; then enforce constraints and switch scoped queries.
4. Preserve deal IDs/URLs where practical. Map existing deals to opportunities and a legacy published funnel reflecting the five enum stages.
5. Create marked baseline visits at migration time. Unknown historical entry times remain unknown; record creation time is not evidence of stage entry.
6. Deploy compatible schema/application changes incrementally. Do not run migrations or seeds automatically on startup.
7. Pilot with representative roles and reconcile records, permissions, metrics and jobs before broader rollout.

Before new-model writes, restore the prior compatible application if necessary. Afterwards prefer forward fixes or a controlled restore with reconciliation; destructive rollback can lose new journeys.

## Acceptance and verification

| BRD section 72 scenario | Evidence |
| --- | --- |
| Manage leads, customers and organizations | Authorized CRUD, pagination, duplicate warnings and logical deletion |
| Track opportunities | Valid links, money, ownership and status |
| Create custom funnels and stages | Visual creation, invalid draft rejection and publication permission |
| Assign/move opportunities | Enrollment, board and keyboard interaction through validated transitions |
| Block invalid movement | Missing data/activities reject without partial writes |
| Preserve stage history | Transaction, concurrency and repeated-command checks |
| Manager pipeline | Correct visibility and column membership |
| Follow-up activities | Ownership, due date, completion and timeline |
| Stage automation | One task/notification despite failure and replay |
| Conversion/drop-off/aging | Hand-calculated cohorts, re-entry, versions and migration cases |
| Customer history | CRM, activity, manual communication, movement and automated events |
| Role restrictions | Negative read/write/search/report/assignment and cross-tenant tests; revoked membership |
| Audit | Actor, timestamp, before/after, action and organization with restricted access |

Use PGlite for compatible deterministic migration/domain checks, and a real Neon development branch for adapter transactions, concurrency and sessions. Add browser tests for the sales journey and permission failures. Run npm run lint, npm run typecheck, npm test and npm run build at release gates. Verify desktop/tablet layouts, supported browsers and practical mobile flows.

Agree measurable workload and service targets during M0. Suggested starting points, not BRD promises, are p95 lists/details under 2 seconds, transition acknowledgement under 1 second, 99.9% availability, recovery point within 1 hour and recovery time within 4 hours. Validate affordability and hosting support before adoption. Monitor application errors, transition conflicts, worker lag, retries and reporting latency; rehearse actual recovery.

## Requirement coverage

| FR identifiers | Delivery |
| --- | --- |
| 001–004 CRM records | MVP; broader lifecycle enrichment later |
| 005–006 Designer/stages | MVP; rich graph editor later |
| 007 Branching | Transition-edge model in MVP; conditional routing 1.1 |
| 008–010 Instances/history/pipeline | MVP |
| 011 Automation | Basic MVP; advanced triggers/actions 1.1 |
| 012 Activities | MVP; provider sync later |
| 013 Assignment | Manual MVP; rule-based 1.1 |
| 014 Scoring | Score storage/provenance MVP; configurable rules/decay 1.1; AI later |
| 015–016 Campaigns/sources | Sources MVP; campaigns 1.1 |
| 017 Customer 360 | Basic MVP; attachments/provider ingestion 1.2 |
| 018–020 Analytics/dashboards | Basic MVP; comparison and forecasting 1.2 |
| 021–023 Users/roles/audit | MVP; custom roles/department hierarchy 1.1 |
| 024 Import/export | Pilot migration tooling MVP; user-facing CSV/Excel/export 1.1 |
| 025–026 APIs/webhooks | Internal contracts MVP; secure public API v1/webhooks 1.1 |
| 027–028 Products/notifications | MVP; email and more channels 1.1 |
| 029 Custom fields | Standard required fields MVP; administrator-defined types/lookups 1.1 |
| 030 Templates | Starter clone MVP; managed library 1.1 |

## Decisions and risks

Resolve before dependent implementation: MVP boundary; tenant migration map; role/visibility matrix; currency/range; customer identity; branching/custom-field scope; terminal/paused outcomes; re-entry; business calendars; worker hosting; service objectives; retention and attachment storage.

Key risks are isolation regressions during migration, mutable definitions corrupting history, duplicate automation after retries, misleading metrics and excessive administrator complexity. Mitigate with tenant-aware constraints and negative tests, immutable versions, outbox/idempotency, agreed reporting fixtures and guided templates with minimal mandatory fields.

## Following releases

Release 1.1: conditional branching, richer automation/escalation, assignment/scoring rules, campaigns, custom fields, department visibility/custom roles, import/export, configurable duplicates/merge, templates, API v1, email and signed webhooks. APIs require scoped credentials, rotation, rate limiting and logs; webhooks require signing, endpoint validation, bounded retries and replay controls. Size these increments separately.

Release 1.2: comparisons, forecasting dimensions, attachments, communication integrations and onboarding/retention/re-engagement journeys. Resolve the forecasting overlap in BRD sections 7, 36 and 55: MVP weighted pipeline, time-phased forecasting later.

Intelligence follows reliable historical data and measured evaluation. Begin with deterministic bottleneck indicators before AI scoring, prediction and recommendations.

## First implementation backlog

1. Confirm inception decisions and acceptance examples.
2. Record architecture decisions for tenancy, policy, customer identity, transactions and versions.
3. Prepare tenant migration SQL and rehearsal fixtures.
4. Build membership and policy services with isolation tests.
5. Move existing CRM reads, mutations and audit onto the shared foundation.
6. Deliver lead-to-opportunity and draft-to-publication-to-first-transition vertical slices.
7. Refine remaining estimates using those results.
