# M0 inception package

Prepared 21 October 2026 against Develop after commit `8d135ed`. This package implements the M0 planning and prototype deliverables. **The M0 exit gate remains open until the outstanding product and operating decisions below are confirmed.** Existing implementation defaults are evidence of code behavior, not evidence of stakeholder agreement.

## Decision update — 26 October 2026

The user explicitly approved product decisions 1–7 in this chat: D05 invitation behavior, D06 customer matching, configurable completed-call gates disabled in the starter template, scoped funnel/automation permissions, separate journey outcome/opportunity status, deferred pause/resume and terminal reopening, and the documented reporting definitions/fixtures. Stage revisits are permitted only through published transitions with every visit preserved; this approval does not claim current support for backward transitions.

**Operating answers 8–14 were submitted as unfilled bracketed alternatives.** No selection, budget, provider, region, data classification, pilot commitment, named owner, retention policy or requirements authority is inferred. D08–D11 and D14 remain open; existing operating proposals remain proposals, not newly selected recommendations. D03–D04 locale approval remains in force, with denomination inventory and rollout pending.

Source reconciliation before recording approval found:

- M3 now implements funnels, immutable publication, execution/history and the board; older M0 comparison/dictionary/backlog descriptions are historical, not current feature status. The [M3 report](phase-3-funnels.md) and current schema/services govern implementation evidence.
- Current fixed-role permissions, disabled starter activity gates and explicit opportunity-status changes agree with the approved policy. Automation configuration permissions are an approved M4 contract; automation itself is not implemented.
- `lib/funnels/definition.ts` enforces ordered forward edges; M3 stores one visit per stage per instance. Approved revisit semantics require later validator/schema/service changes and acceptance tests before revisits can be offered. Terminal reopening remains deferred; explicit enrollment of a new journey after completion is separate and already supported.
- `requireUser()` checks session presence without an explicit `emailVerified` guard. Upstream uncached session reads improve revocation handling but do not replace live verification/session evidence. IAM-02/D15 remains open.
- Reports/fixtures are approved specifications, not implemented M5 reporting. Money formatting remains USD and activity input remains UTC; journey timestamps already display Asia/Manila.

This update changes documentation only. M0 and pilot acceptance remain open.

## Review path

1. Review the scope, role matrix and decision register on this page.
2. Review the [current and proposed data dictionary](m0/data-dictionary.md), [metric definitions and acceptance examples](m0/metrics-acceptance.md), and [architecture and operating targets](m0/architecture-operations.md).
3. Open the [offline sales-funnel prototype](m0/prototype/index.html) in a browser. See its [review guide and wireframes](m0/prototype-guide.md). It uses fictional, in-memory data and does not connect to the CRM.
4. Review the [requirements backlog](m0/backlog.md). Assign the named business/technical/operations responsibilities to actual people, record decisions, and then close the M0 exit checklist.

## Historical inception comparison (21 October 2026)

| M0 deliverable | Evidence in current code | Remaining inception work addressed here |
| --- | --- | --- |
| Scope and terminology | Leads, contacts, accounts (`companies`), opportunities (`deals`), products/sources, activities, shared workspaces | Consolidated MVP/release boundary, glossary and explicit exclusions |
| Roles and visibility | `lib/access/policy.ts`, `lib/domain/workspace.ts` implement fixed roles and own/team/organization scope | Exact matrix, persona mapping and proposed funnel/automation responsibilities |
| Identity/invitations | Neon Auth, seven-day verified-email invitation links | Document the actual journey and live verification acceptance gap |
| Transaction choice | `lib/db/index.ts`, `lib/domain/workspace.ts`, `lib/domain/workflow.ts` use `pg`/Drizzle transactions and workspace locks | Record the decision, tradeoffs and evidence required before narrowing locks |
| Currency/timezone/calendar | USD/UTC database defaults, USD formatter, UTC activity input; no business-calendar engine | Separate current behavior from proposed pilot conventions and metric semantics |
| Data dictionary and metrics | Schema/Zod definitions and existing open-pipeline dashboard | Document all current tables, proposed later contracts, formulas and hand-calculated examples |
| Sales-funnel/board prototype | Historical M0 baseline only; M3 now supplies production designer/execution code (see phase-3-funnels.md) | Offline, reviewable designer/board sketch; no application funnel tables or execution added |
| Hosting/worker/pilot/operations | No committed hosting, durable worker, restore evidence or retention job configuration | Proposed deployment topology, scheduling contract, sizing assumptions, quantified targets and rehearsal gates |
| FR/BR backlog | Plan contains an FR coverage summary and only one identified BR (`BR-004`) | Traceable backlog with dependencies, acceptance examples and explicit source gaps |

Code gaps remain visible: `requireUser()` currently checks for a session but does not explicitly require `emailVerified`; invitation acceptance does check verification. There is no dedicated verification page in the current routes. Provider enforcement and a complete real signup/verification/login flow are unverified. This M0 package records that as a pre-pilot acceptance item; it does not claim or implement an authentication fix.

## Confirmed baseline

The user confirmed on 21 October 2026: use the existing MVP scope and four-role matrix; pilot conventions are **PHP, Asia/Manila, elapsed calendar time**. The current application remains USD/UTC. This M0 decision does not authorize treating historical USD values as PHP or add runtime timezone behavior. [OPS-01 in the backlog](m0/backlog.md) specifies the required rollout. Hosting, pilot sizing, budget and retention have not been confirmed.

## Prototype approval — 21 October 2026

**Reviewer:** user, by explicit instruction in this conversation. **Baseline:** the default M0 prototype committed in `fcc82a4`, described in the [prototype guide](m0/prototype-guide.md).

> I approve the M0 prototype’s stage order, probabilities, durations, and required fields. Record my approval in the documentation.

| Approved item | Recorded baseline |
| --- | --- |
| Stage order | Lead → Qualified → Proposal → Won; Lost is an exit from each nonterminal stage |
| Stage probabilities | Lead 10%, Qualified 30%, Proposal 60%, Won 100%, Lost 0% |
| Target durations | Lead 48, Qualified 72, Proposal 120 elapsed hours; no duration target for Won/Lost |
| Required fields | Expected close date for Proposal; outcome reason for Lost; other stages retain the baseline fields shown in the guide |

The 26 October product approval additionally confirms optional completed-call gates disabled in the starter template, scoped configuration/movement permissions, separate opportunity status and reporting/outcome policy recorded below. Specific editable stage-role defaults remain guidance rather than new permission grants. Hosting, pilot operations, retention and live evidence remain open. M0 operational sign-off and production implementation/deployment are separate gates.

## Scope baseline

| Delivery | Included |
| --- | --- |
| MVP across M1–M5 | Shared organizations/teams, four fixed role presets and scoped CRM; leads, explicit conversion, accounts, contacts, opportunities, products, sources, manual assignment, manual score with provenance, tags, activities and Customer 360; ordered funnel editor, stage rules, immutable versions, a cloneable standard sales template, enrollment, validated movement/history, keyboard-accessible pipeline board; stage-entry task/in-app notification actions through a durable outbox; basic scoped conversion/drop-off/aging/pipeline reporting; audit, logical deletion, pagination, migration/restore and pilot evidence |
| Release 1.1 | Conditional branching; configurable score/assignment rules; campaigns; custom fields/roles/department scopes; user import/export; public APIs/webhooks; broader workflows and template management |
| Release 1.2 | Attachments, provider communications/mailbox ingestion, reporting comparisons and advanced forecasting |
| Later / excluded pending source reconciliation | AI, BRD section 7 future capabilities and section 8 exclusions. Exact section 8 text is unavailable, so no additional integration or product obligation is inferred |

M1/M2 source work does not establish pilot acceptance. M3–M5 application features are not implemented by this M0 package. There is no silent change to existing tenant data, currency or permissions.

## Terminology and lifecycle

| Term | Meaning |
| --- | --- |
| Workspace / organization | Tenant and access boundary; never inferred from a user's email domain |
| Account / company | Customer business inside a tenant; retained `/companies` URLs and `crm_companies` table |
| Contact | A person, optionally linked to an account; may have multiple opportunities |
| Lead | An unconverted sales prospect with capture/source/score provenance; conversion links persist |
| Opportunity / deal | A potential sale; retained `/deals` URLs and `crm_deals` table |
| Customer | Explicit account/contact lifecycle value, not a separate tenant and not automatically asserted by conversion |
| Lead conversion | Atomic create/match of contact/account and optional opportunity; repeat requests return the stored result |
| Funnel version | Proposed immutable published configuration; draft edits never rewrite active journeys |
| Journey / instance | Proposed opportunity enrollment on a specific version; one active journey per opportunity by default (`BR-004`) |
| Stage / visit | Proposed configured stage versus one timed occurrence of a journey entering that stage |
| Opportunity status | Current `open` / `won` / `lost`; distinct from stage and journey outcome; Won/Lost requires an explicit action |
| Journey outcome | Implemented `successful` / `unsuccessful` terminal outcome with required abnormal-exit reason; dedicated pause/resume and terminal reopening deferred by the 26 October approval |
| Activity | Manual task, call, meeting, email record or note; a logged email does not send or synchronize a message |

## Existing role matrix

Derived from `lib/access/policy.ts`. A check is a policy permission, not proof that every corresponding business feature exists.

| Role | Scope | View | Create | Edit | Logical delete | Assign | Approve* | Export* | Configure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Administrator | Organization | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Manager | Team | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Representative | Own | Yes | Yes | Yes | Yes | No | No | No | No |
| Read-only | Organization | Yes | No | No | No | No | No | No | No | No |

*Approval workflows and user-facing export are not current features. Organization-wide Read-only access is part of the user-confirmed role baseline; “read-only” does not mean “own records only.” Individual assignments still require explicit administrator action.

The confirmed role baseline retains the existing organization-wide Read-only scope.

Team scope includes own records, records owned by active peers in shared teams, and explicitly team-assigned records. Assignment requires an active same-tenant user and a valid user/team combination; managers stay within their scope. Unsupported department/custom scopes are denied. Job titles never grant permissions. Map sales managers to Manager, sales agents/account executives to Representative, and approved observers/analysts to Read-only; appoint administrators explicitly. Unmapped personas receive no access.

Approved responsibility mapping (26 October 2026): Administrator designs/publishes/archives funnel templates and configures automation; Manager and Representative enroll/move only visible opportunities with edit permission; Read-only browses permitted boards/history. Blueprint definitions may be visible to active members without exposing other users' records. M3 enforces these funnel permissions; automation permissions are an approved M4 requirement, with enforcement/verification pending implementation. Stage responsibility is guidance, not an additional permission grant.

## Decision register

Statuses: **Implemented default** describes the repository; **Proposed** is a concrete review recommendation; **Confirmed** requires an explicit recorded user/stakeholder choice. Responsible parties below are roles to assign, not people already committed to the project.

| ID | Decision | Evidence / recommendation | Status | Responsible party / gate |
| --- | --- | --- | --- | --- |
| D01 | MVP versus release 1.1/1.2 | Scope table above, matching the implementation plan; preserve unknown BRD section 8 exclusions | Confirmed by user, 21 October 2026 | Product owner maintains scope; BRD reconciliation still open |
| D02 | Role/persona and visibility matrix | Exact current matrix above; organization-wide Read-only included in the retained matrix | Confirmed by user, 21 October 2026 | Product owner and workspace administrator before pilot |
| D03 | Initial currency and range | Pilot uses PHP, integer minor units and the current 0–9,999,999.99 unit/opportunity range; no mixed-currency totals. Current code uses USD: inventory/resolve existing values and deploy currency-aware formatting before PHP pilot data is accepted | PHP confirmed by user; rollout pending | Product owner/finance before pilot imports |
| D04 | Timezone and calendar | Pilot uses Asia/Manila display/business dates and elapsed calendar time; instants stay stored in UTC. Existing UTC input/display needs an explicit rollout; business-hour/holiday calendars are excluded | Confirmed by user; display/input rollout pending | Product owner before M3 duration rules |
| D05 | Invitation journey | Administrator creates manually shared link; seven days, hashed token, matching verified email, single use, revocable; signed-out user signs in/verifies then reopens link. Automatic invitation email is not promised | Confirmed by user, 26 October 2026; live delivery verification pending | Workspace administrator before pilot |
| D06 | Customer identity / duplicates | Explicit visible matches on conversion; duplicate warnings, no automatic merge; existing matched records are preserved; new converted records assigned to converting actor | Confirmed by user, 26 October 2026; live acceptance pending | Sales/data steward before import |
| D07 | Transactions and access | Modular monolith, Drizzle `node-postgres`, transaction + audit; conservative tenant row lock, current per-instance pool maximum five | Implemented decision | Technical lead; change only with equivalent isolation/concurrency evidence |
| D08 | Hosting and worker | Proposed: Next.js on Vercel Node runtime, Neon Postgres/Auth, separate continuously running Node worker on a managed container host (candidate Render), one database region. Worker polls transactional outbox every five seconds with database leases; no request-tail processing | Proposed; provider/region/budget not selected | Technical/operations owner before M4; measured pool/connection budget before pilot |
| D09 | Pilot volume and staffing | Proposed 2 tenant workspaces, 25 active members total, 10 concurrent sessions, 10,000 leads, 5,000 contacts, 1,000 accounts, 5,000 opportunities, 50,000 activities and 100,000 journey events across the pilot; one named champion per tenant; 10 business-day pilot | Proposed; no staff commitment | Product/operations owner before load test/pilot |
| D10 | Service/recovery targets | Proposed targets and measurement windows in the operating document; capacity, cost and restore capability must be demonstrated | Proposed | Operations owner before release acceptance |
| D11 | Retention / privacy | Proposed operational logs 30 days and completed automation diagnostics 90 days. Business/audit data retained until an approved retention/erasure policy; no automatic purge. Backup retention candidate 7 days only if provider plan supports the RPO | Proposed; legal/business periods unresolved | Data owner/legal and operations before real pilot data |
| D12 | Standard sales template | User-approved default stage order, probabilities, elapsed-hour durations and required fields recorded above and in the prototype guide | Stage properties confirmed 21 October; optional activity gates/default-off and scoped permission mapping confirmed 26 October 2026; editable stage-role values remain guidance | Sales owner verifies approved gates/permissions at acceptance |
| D13 | Metrics and outcomes | Documented metric definitions/fixtures approved; separate journey outcome and explicit opportunity Won/Lost action. Defer dedicated pause/resume and terminal reopening. Revisits only through published edges, preserving every visit; current ordered M3 does not support revisits | Confirmed by user, 26 October 2026; M5 reports and revisit support pending | Sales/product/reporting owner verifies M5 metrics and future revisit implementation |
| D14 | BRD reconciliation | FR-001–030 and BR-004 are references from the plan only; source BRD, full BR list, sections 8/13–16/66/72 and exceptions still needed for authoritative acceptance | Open source gap | Product owner before final requirement sign-off |
| D15 | Identity/session acceptance | Verify Neon verification settings/email delivery, explicit server verification protection, revocation, password reset and invitation reopening in a disposable branch | Open live/security evidence gap | Technical lead before pilot |

No hosting account is provisioned, no worker is deployed, no retention deletion is executed, and no existing values are re-denominated by these proposed decisions.

## M0 exit checklist

- [x] Compare plan with current policy, schema, workflows, session boundary, scripts and deployment inventory.
- [x] Produce scope baseline, exact current role matrix, terminology and a decision register with responsible roles.
- [x] Produce current/proposed data dictionary, metrics/fixtures and FR/BR backlog with acceptance examples.
- [x] Produce an offline, keyboard-usable standard sales-funnel/board prototype and review scenarios.
- [x] Specify concrete candidate hosting/worker architecture, pilot sizing and measurable operations/recovery/retention proposals.
- [x] Record user confirmation of D01–D04: existing scope/roles, PHP, Asia/Manila and elapsed calendar time.
- [x] Record explicit user approval of D12 prototype stage order, probabilities, durations and required fields on 21 October 2026.
- [x] Record user approval of D05–D06, D12 activity-gate/permission policy and D13 reporting/outcome policy on 26 October 2026.
- [ ] Assign actual owners and reconcile authoritative BRD/source gaps D14; operating answers remain unfilled.
- [ ] Deliver and verify approved contracts that exceed current code, including future revisit support and M4/M5 features; approval is not implementation evidence.
- [ ] Deliver the separately tracked PHP/Asia-Manila rollout before accepting pilot data; this planning-only M0 change does not migrate runtime values.
- [ ] Select providers, region, budget, staffing and retention/privacy policy for D08–D11; validate that the selected plans support the proposed targets.
- [ ] Attach live Neon signup/verification/session/revocation/reset/invitation evidence (D15/IAM-02), plus disposable migration and timed backup/restore rehearsal evidence before pilot acceptance. Record remaining reviewer findings; product approvals do not close these evidence gates.

M0 artifacts can be reviewed now. Agreement and live operating evidence remain open rather than being silently marked complete.

## Verification performed

- `npm run lint` and `node --check docs/m0/prototype/prototype.js` pass.
- Local Markdown references and prototype asset/review-guide paths resolve against the repository.
- A Chromium check served only the local static prototype and passed 39 assertions: initial board/PHP display; required-field correction; stale-view rejection/refresh; version pinning; read-only controls; keyboard reorder; duplicate-name/terminal-probability publication errors; required abnormal-exit reason; separate journey outcome/opportunity status; loading/empty/error/retry; reset; light/dark layouts at 1440/768/390px; no document horizontal overflow, external-origin requests, local-storage writes or JavaScript page errors.
- Desktop/mobile screenshots were visually reviewed. Prototype behavior is a deterministic sketch, not evidence of PostgreSQL concurrency, production idempotency, server authorization, real provider sessions, hosting capacity or recovery targets.

Only README, planning documents and offline prototype assets changed. Application build/database suites are not a new release-evidence claim for this documentation/prototype task; existing M1/M2 reports remain dated historical evidence. The [review guide](m0/prototype-guide.md) contains the manual scenarios to repeat when changing the sketch.
