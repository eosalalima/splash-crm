# M0 requirements and acceptance backlog

This is an actionable decomposition of the [implementation plan](../implementation-plan.md), not a transcription of the unavailable source BRD. FR references below retain the plan's identifiers/coverage grouping. In particular, FR-001–004 are mapped as one CRM group because assigning an exact original requirement sentence to each would invent source detail. **BR-004 is the only numbered business rule identified in the repository.** Other rules below have local acceptance IDs (A01–A12), not invented BR numbers.

Statuses distinguish **code present / acceptance pending**, **planned**, **deferred**, and **source reconciliation open**. The original M0 package created planning artifacts only; M3 was subsequently implemented separately. M4 is now implemented locally; hosted/live acceptance and M5 remain pending. Responsibilities name roles to assign, not people already assigned.

## Status reconciliation — 26 October 2026

The user approved D05–D06 and D12–D13 product policies in the [decision register](../m0-inception.md#decision-update--26-october-2026). Operating template answers remain unfilled. M3 code/local verification now exists; live acceptance remains pending. Approved revisits require future validator/schema/service work because current M3 allows only ordered forward edges and one visit per stage. M4 automation is implemented locally; hosted/live acceptance, M5 reporting, OPS-01 locale rollout and IAM-02/live identity evidence remain pending. Named owners and requirements authority are unresolved.

## Delivery backlog

| Local item | BRD reference from plan | Scope / responsible role | Dependency and concrete acceptance | Milestone / status |
| --- | --- | --- | --- | --- |
| CRM-01 | FR-001–004 | Leads, contact/account lifecycle, opportunities; sales/data owner | Tenant-scoped CRUD, pagination, duplicates, validated money/links, logical deletion; A01 | M1/M2 code present; full source fields/live acceptance pending |
| CRM-02 | FR-001–004, FR-017 | Explicit lead conversion/matching/provenance; sales/data owner | A02/A03 repeated/concurrent conversion and injected audit failure; original matched records unchanged | M2 code present; live acceptance pending |
| DES-01 | FR-005–006, FR-029 | Draft ordered editor and standard fields/activity gates; product/sales owner | M0 prototype review; A05 invalid draft rejection; semantic/layout separation, keyboard reorder; no custom-field engine in MVP | M3 code present; live acceptance pending |
| DES-02 | FR-007 | Explicit versioned transition edges; product/technical owner | DES-01; reachable entry/terminals and required reasons; conditional branching operators deferred | M3 ordered edges code present; revisit support pending; branching 1.1 |
| EXE-01 | FR-008–010, BR-004 | Publish, enroll, one active instance per opportunity; technical owner | DES-01/02; A05 published immutability, old-version pinning, tenant-aware uniqueness | M3 code present; live acceptance pending |
| EXE-02 | FR-008–010, BR-004 | Atomic movement/history and board; technical/sales owner | EXE-01; A06/A07 missing fields, stale revision, repeated key and concurrent commands; one open visit; keyboard movement/error rollback | M3 code present; live acceptance pending |
| EXE-03 | FR-008–010 | Outcomes, reasons, re-entry and baseline migration; product/data owner | Apply approved separate status, deferred pause/terminal reopening and published-edge revisit policy; A08 no stage-label/status inference; mark unknown historical entry; preserve deal IDs | M3 ordered outcomes/baseline code present; approved revisit support pending; live acceptance pending |
| AUT-01 | FR-011 | Stage-entry conditions, task/in-app actions, outbox; technical owner | EXE-02 commits events; standalone leased worker implemented; hosting selection/live verification pending; A09 crash/replay and authorization | M4 code present; hosting/live acceptance pending |
| AUT-02 | FR-011 | Rich workflow actions and stage-changing loop controls | AUT-01; specify depth/cycle limits before arbitrary feedback paths | 1.1 deferred |
| ACT-01 | FR-012 | Activity ownership/due/priority/status/outcome and manual communications; sales owner | A04 scoped linked/unlinked activities and Customer 360; no mailbox sending claim | M2 code present; live acceptance pending; provider sync 1.2 |
| OWN-01 | FR-013 | Manual user/team assignment; workspace administrator | A01 active target, same tenant/team and manager scope; ordinary edit preserves hidden/current assignment | M1/M2 code present; assignment rules 1.1 |
| SCR-01 | FR-014 | Manual score and reason/provenance; sales owner | Score 0–100, nonzero score explanation; not probability or an automated recommendation | M2 code present; rules/decay 1.1; AI later |
| SRC-01 | FR-015–016 | Lead source configuration; administrator | Active same-tenant selection; archive retains historical links | M2 code present; campaigns 1.1; exact per-ID source mapping open |
| C360-01 | FR-017 | Scoped CRM/activity timeline and conversion links; sales owner | A01/A04; no restricted audit snapshots, hidden links or fabricated movement; M3/M4 events added only when real | M2 basic code present; enrichment M3/M4; attachments/provider ingestion 1.2 |
| REP-01 | FR-018–020 | Cohort conversion/drop-off/aging, pipeline and role dashboards; reporting owner | EXE-02 and agreed metric contract; A10 fixtures/visibility/version/timezone/currency; explicit no-override probability representation | M5 planned; existing dashboard is counts/legacy stages only |
| IAM-01 | FR-021–023 | Fixed roles, teams, memberships, manual invitation and audit; administrator/technical owner | A01/A12; named personas, matching verified invitation email, last-admin protection, append-only transactional audit | M1 code present; live identity/security acceptance pending; custom roles/departments 1.1 |
| IAM-02 | FR-021–023 | Explicit protected-route verification behavior and real Neon journey; technical owner | A12; inspect installed SDK/config, retain email across verification without secrets, require verified state before protected access | Pre-pilot M1/M2 follow-up, **not implemented under M0** |
| DAT-01 | FR-024 | Controlled pilot migration/inventory/reconciliation; data/operations owner | A11 backup/restore and counts/IDs/links; no unapproved tenant merge or denomination relabeling | M1/M2 scripts present; live rehearsal pending; user import/export 1.1 |
| INT-01 | FR-025–026 | Shared internal domain contracts; technical owner | All callers enforce same permissions/transactions; no public bypass | Existing internal services; public API/scoped credentials/webhooks/replay 1.1 |
| PRD-01 | FR-027 | Product configuration and opportunity snapshot lines; administrator | Reprice/archive leaves line snapshots intact; quantity limits; opportunity value remains explicit | M2 code present; live acceptance pending |
| NOT-01 | FR-028 | In-app notifications tied to stage-entry events; technical/product owner | AUT-01; one recipient/effect per event/action, current subject visibility on read | M4 code present; hosted/live acceptance pending; email/other channels 1.1 |
| FLD-01 | FR-029 | Standard required fields in stage gates; product owner | DES-01/A06 use known schema fields; reject unknown references | M3 code present; live acceptance pending; administrator-defined types/lookups 1.1 |
| TMP-01 | FR-030 | One cloneable standard sales template; sales owner | M0 stage/default-off activity/permission policy approved; clone creates draft, no mutation of referenced published version | M3 code present; live acceptance pending; managed library 1.1 |
| OPS-01 | Cross-cutting; no supplied BR number | Confirmed PHP/Asia-Manila/elapsed convention rollout; product/finance/technical owner | Inventory actual denominations and tenants, resolve legacy USD data via approved conversion or separation, add coherent currency-aware display/storage policy and local date/input conversion; no mixed totals; test UTC boundary and explicit zero probability | Required before PHP pilot; runtime changes outside this M0 task |
| OPS-02 | Cross-cutting; A11 | Hosting, monitoring, backup/restore, retention and pilot; operations/data owner | Named providers/region/budget/owners; workload, RPO/RTO, permissions and restart/replay evidence per operations document | M0 proposal; delivery/evidence M4/M5 |
| SRC-02 | BRD sections 8/13–16/66/72 and missing BR list | Source reconciliation and exceptions; product owner | Acquire authoritative version, map exact fields/exclusions/acceptance and additional BR IDs, record delta decisions before claiming sign-off | Open; no fabricated source requirements |

## Traceability coverage check

| Supplied reference | Backlog coverage |
| --- | --- |
| FR-001–004 | CRM-01, CRM-02 |
| FR-005–006 | DES-01 |
| FR-007 | DES-02 |
| FR-008–010 | EXE-01, EXE-02, EXE-03 |
| FR-011 | AUT-01, AUT-02 |
| FR-012 | ACT-01 |
| FR-013 | OWN-01 |
| FR-014 | SCR-01 |
| FR-015–016 | SRC-01 |
| FR-017 | C360-01, CRM-02 |
| FR-018–020 | REP-01 |
| FR-021–023 | IAM-01, IAM-02 |
| FR-024 | DAT-01 |
| FR-025–026 | INT-01 |
| FR-027 | PRD-01 |
| FR-028 | NOT-01 |
| FR-029 | FLD-01, DES-01 |
| FR-030 | TMP-01 |
| BR-004 | EXE-01, EXE-02 |
| Other BR numbers | Unknown until SRC-02; local A01–A12 are examples, not substituted BR identifiers |

## Sequence and review responsibilities

1. Product owner maintains the confirmed scope/role/locale and 26 October product decisions and resolves remaining source/operating choices. Record unresolved differences as decisions, not implicit changes.
2. Technical/data owners plan OPS-01 and IAM-02 before PHP pilot data; existing M1/M2 live acceptance remains pending.
3. Sales/product/technical owners verify M3 against approved template/outcome policy and scope future revisit changes; reporting owners use approved metric examples for M5. No new schedule is committed here.
4. Operations chooses hosting/worker/pilot volume/budget/retention, then M4 implements and rehearses AUT/NOT contracts.
5. Reporting/operations demonstrate REP-01 and OPS-02 against fixtures, scoped browser journeys and a timed restore before the pilot exit decision.

Acceptance example details: [A01–A12 and metric fixtures](metrics-acceptance.md). Operating thresholds: [architecture and operations](architecture-operations.md). Named people, dates and estimates remain unassigned until actual team commitments are supplied.
