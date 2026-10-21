# M0 metric definitions and acceptance examples

Definitions are proposed for sales/reporting review; the pilot conventions **PHP, Asia/Manila, elapsed calendar time** are confirmed by the user. The current dashboard is limited to counts and legacy-stage aggregates; the versioned metrics below are design contracts, not new reports implemented by M0.

## Reporting contract

Every report must identify tenant, authorized scope, currency, immutable funnel version, cohort basis, displayed timezone, query/as-of timestamp and observation cutoff. Recheck visibility in aggregates and drill-downs. A missing denominator returns “not available,” never 0% or infinity. No currency conversion or mixed USD/PHP totals are implied.

Use Asia/Manila local boundaries for selected reporting dates, then convert them to UTC instants and query half-open `[start,end)` intervals. Example: the day 1 November 2026 in Manila is `[2026-10-31T16:00:00Z, 2026-11-01T16:00:00Z)`. Elapsed durations are differences between instants, include weekends/holidays and do not depend on business-hour calendars.

| Metric | Definition | Important limits |
| --- | --- | --- |
| Funnel entries | Distinct instances enrolled during the entry-date cohort, per immutable version | Not “records updated during period”; exclude explicitly synthetic migration enrollment from historical business claims |
| Funnel conversion | Successful terminal instances / all entries in that cohort, as of cutoff | Show active count and cutoff; not successful / closed only |
| Stage conversion | Distinct cohort instances taking a selected outgoing transition / distinct cohort instances entering its source stage | Count an instance once per chosen edge even on re-entry; publish numerator/denominator; version-specific |
| Drop-off | Unsuccessful terminal instances / all cohort entries, attributed to the exit stage | Open journeys are not drop-offs. Deferred/paused handling remains unresolved; do not map it silently to lost |
| Completed stage duration | Per-visit `exitedAt - enteredAt`, summarized with count and median/p95 | Exclude unknown-entry baselines; repeated entry is a separate visit. Do not substitute record creation time |
| Open-stage age | `asOf - currentVisit.enteredAt` | Separate from completed duration; unknown baseline ages display unknown |
| Aging threshold | Open-stage age strictly greater than versioned target elapsed hours | At exactly 48h a 48h target is not yet overdue; target zero/no target is untracked |
| Open pipeline | Sum of visible open opportunity values, grouped by currency | Count opportunity once despite multiple product lines or journeys; use opportunity value, not catalog totals |
| Weighted pipeline | Sum(value × effective probability / 100), grouped by currency | Proposed precedence: explicit opportunity override, otherwise pinned-stage probability. Current always-defaulted integer probability cannot distinguish “no override” from explicit 0%; M3/reporting must add that distinction, not use `probability || stageProbability` |
| Cycle time | Enrollment to successful completion for successful cohort instances | Report sample size and cutoff; open/lost instances excluded from successful-cycle durations but remain in conversion denominator |
| Follow-up overdue | Visible open activities with non-null dueAt strictly before asOf | Completed/cancelled and no-due-date activities are not overdue; completion outcome is required |

Re-entry is included in proposed stage-instance conversion counts once, while visit duration counts each visit. Business agreement on allowing re-entry/re-enrollment and paused outcomes is still open. Metric arithmetic below does not resolve that product choice.

## Hand-calculated cohort fixture

All instances belong to one test organization and published version v1; local cohort 1–7 November 2026, cutoff 8 November 2026 00:00 Asia/Manila. Fixtures are fictional and are not inserted into the application's database.

| Instance | Enrolled in cohort? | Visited stages by cutoff | Outcome | Exit stage |
| --- | --- | --- | --- | --- |
| A | Yes | Lead, Qualified, Proposal, Won | Successful | Won |
| B | Yes | Lead, Qualified, Proposal | Active | — |
| C | Yes | Lead, Lost | Unsuccessful | Lead |
| D | Yes | Lead, Qualified, Lost | Unsuccessful | Qualified |
| E | Yes | Lead | Active | — |
| X | No (earlier cohort) | Lead, Qualified, Proposal, Won during reporting period | Successful | Won |
| Y | Yes, but belongs to v2 | Lead, Qualified | Active | — |

For v1: entries = 5; successful = 1; unsuccessful = 2; active = 2; funnel conversion = 1/5 = **20%**; drop-off = 2/5 = **40%**, split Lead 20% and Qualified 20%. Lead → Qualified conversion = 3/5 = **60%**. Qualified → Proposal conversion = 2/3 ≈ **66.67%**. Proposal → Won conversion = 1/2 = **50%**. X is excluded from the entry cohort; Y must not be merged into v1. Showing “1 of 3 closed = 33.33%” is a different close-rate metric and must not be labeled funnel conversion.

Duration fixture: completed Qualified visits last 24h, 48h and 72h. Median = **48h**. An open visit at 60h is reported separately and is overdue against a 48h target; it is not a fourth completed duration. A baseline with unknown entry time contributes neither duration nor known-age count.

## Hand-calculated money fixture

| Opportunity | Currency | Status | Value | Effective probability | Weighted amount |
| --- | --- | --- | --- | --- | --- |
| P1 | PHP | Open | ₱10,000.00 | Explicit override 20% (stage 60%) | ₱2,000.00 |
| P2 | PHP | Open | ₱5,000.00 | No override, pinned stage 60% | ₱3,000.00 |
| P3 | PHP | Won | ₱2,000.00 | 100% | Excluded from open pipeline |
| P4 | USD | Open | $100.00 | 50% | $50.00, reported separately |
| P5 | PHP | Open, outside viewer scope | ₱1,000.00 | 100% | Excluded |
| P6 | PHP | Open | ₱1,000.00 | Explicit 0% override | ₱0.00 |

Visible PHP open pipeline = **₱16,000.00**. Weighted PHP pipeline = **₱5,000.00**. USD is a separate $100.00 / $50.00 group, never added as 100 pesos. Product lines must not multiply either pipeline total. The no-override P2 behavior is a proposed later contract, not something the current default-zero probability column can represent.

## Acceptance examples for delivery backlog

| Example | Given / action / expected result | Owner milestone |
| --- | --- | --- |
| A01 Tenant and role isolation | Two organizations have identically named records; representative searches, reads a guessed ID, updates, deletes and requests a report. Only own permitted records are returned or changed; unrelated tenant data is unavailable. Read-only has view only with its confirmed organization scope | M1; regression at every milestone |
| A02 Conversion | Same visible lead converted twice/concurrently with the same selected matches. One contact/account/optional opportunity result, original provenance retained, no duplicated audit. An audit failure rolls everything back | M2 |
| A03 Matching | Match an existing visible contact/account without overwriting them. Cross-tenant, hidden or incompatible contact/account selection fails atomically | M2 |
| A04 Activity | Create unlinked or visible-linked activity; completing without outcome fails; completing with outcome writes stable completion timestamp and Customer 360 event. Manual email sends no message | M2 |
| A05 Publication | Draft with missing entry/unreachable stage/invalid reference cannot publish. Valid v1 publishes immutably; v2 edits never rewrite an instance on v1 | M3 |
| A06 Movement | Qualified → Proposal missing expected close or completed call returns actionable errors and leaves history unchanged. After correction, exactly one visit closes/opens and revision increments with audit/outbox | M3 |
| A07 Repetition/conflict | Retrying one movement command returns the original result; two different commands with the same expected revision yield one success and one conflict, with one active visit | M3 |
| A08 Outcomes | Abnormal exit requires a configured reason. Journey outcome and opportunity status are updated only through an explicit documented policy, never inferred from a stage label | M3 |
| A09 Automation | Crash after task creation but before acknowledgement; replay uses event/version/action identity and produces one task and notification. Failure becomes inspectable after bounded retries | M4 |
| A10 Reporting | Cohort and money fixtures above match hand calculation; cross-scope drill-downs agree; version/denominator/timezone/currency/as-of are visible; unknown baselines stay unknown | M5 |
| A11 Recovery | Restore into isolated database, reconcile tenant counts/links and audit/transition/outbox invariants, replay outstanding jobs without duplicates, then measure RPO/RTO | M5 / operations |
| A12 Identity | Real Neon signup/email verification/login/expiry/revocation/password reset, plus signed-out invitation reopening, succeed with verified membership; unverified protection is explicitly established before pilot | M1/M2 acceptance follow-up, not new M0 runtime code |

The [prototype guide](prototype-guide.md) exercises a small subset with in-memory sample behavior. Passing prototype checks does not prove production movement, identity or automation guarantees.
