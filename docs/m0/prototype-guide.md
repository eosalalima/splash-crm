# M0 prototype and wireframe review

Open [the standalone prototype](prototype/index.html) directly in a modern browser. CSS/JavaScript are local sibling files; there are no external fonts, network calls, storage, credentials or CRM imports. For HTTP-only preview tools, run `python -m http.server 8877 --bind 127.0.0.1 --directory docs` from the repository root and open `http://127.0.0.1:8877/m0/prototype/index.html`; serving the docs directory also preserves the relative review-guide link. The prototype is a design sketch, not an authenticated application route, database migration or production funnel engine.

The user confirmed PHP, Asia/Manila and elapsed calendar time. The sample displays PHP and uses Manila history timestamps to show that intent. The real app remains on USD/UTC until the separate rollout item is delivered. Every opportunity/name/value/history item in this sketch is fictional.

## Template approval

On **21 October 2026**, the user explicitly approved the default prototype’s **stage order, probabilities, durations and required fields**, based on the prototype committed in `fcc82a4`. The exact instruction and approved values are recorded in the [M0 decision register](../m0-inception.md#prototype-approval--21-october-2026). Stage responsibility, future permissions and the separate completed-call activity gate remain proposed. This records design approval; M0 operating decisions and M3 delivery acceptance remain open.

## Template baseline

| Stage | Kind | Probability | Target elapsed hours | Responsible role (proposed) | Required on entry |
| --- | --- | --- | --- | --- | --- |
| Lead | Entry | 10% | 48 | Representative | Standard opportunity identity; no additional gate illustrated |
| Qualified | Intermediate | 30% | 72 | Representative | No additional gate illustrated |
| Proposal | Intermediate | 60% | 120 | Manager | Expected close date (approved field); completed call (proposed activity gate) |
| Won | Successful terminal | 100% | None | Representative | No additional gate illustrated; final success/status policy needs review |
| Lost | Unsuccessful terminal | 0% | None | Representative | Outcome reason |

Approved standard flow: Lead → Qualified → Proposal → Won, plus Lost from every nonterminal stage. Stage order, probabilities, elapsed-hour durations and required fields are approved design defaults. Responsibilities and the completed-call activity gate remain proposals. None of these defaults is inferred historical behavior. The initial fictional sample starts in Qualified to make gate review immediate. A stage's responsible role is a design responsibility, not a grant of permissions.

Execution-order Up/Down buttons intentionally change the proposed ordered draft sequence; they do not merely move shapes. Future free positioning/layout must be stored separately and cannot alter transitions. The sketch pins Lead and terminal stages and allows keyboard reordering of the intermediate pair. It is not a full graph validator/designer and intentionally has no drag interaction.

## Wireframes and expected review journeys

| Screen/area | Wireframe layout | Review purpose |
| --- | --- | --- |
| Designer | Heading + draft version → ordered stage list beside stage settings → required field/activity gates → save/publish feedback | Select stage, change probability/duration/responsibility, reorder through labeled buttons, inspect publication errors |
| Pipeline | Version/as-of context → horizontally scrollable stage columns with named opportunity cards → explicit movement controls | Select allowed destination with keyboard, correct required data, see error/success without an optimistic card being stranded |
| Journey detail/history | Current version/revision + stage → requirements/outcome reason → readable timestamped movement list | Understand pinned versions, stale state and reason requirements; review before M3 schema/interaction work |
| Empty/loading/error | Preview-state control changes the board surface; error includes Retry | Review copy and layout before real request/empty/error implementations |
| Scope/permission preview | Role selector; Administrator can edit preview design, Manager/Representative can move, Read-only inspects | Illustrate proposed responsibility split only; this is not server authorization or an implementation of tenant scoping |

## Review script

1. Start in Administrator. Confirm the fictional sample appears under Qualified and v1 is shown.
2. Move to Proposal with empty expected close and incomplete call. Expect both actionable messages and no movement/history entry. Fill the date and check completed call; move again and expect Proposal with one new illustrative history entry.
3. Change the Proposal draft name/probability or reorder the intermediate stages with the Up/Down buttons, then save/publish. The active sample remains on v1 and uses its old stage names/rules. Start a new sample journey to inspect the newly published preview version. This models version pinning only; production immutability/transactions require M3 tests.
4. Set duplicate stage names or change Won away from 100%; preview publication rejects. Correct the draft and retry. The prototype only validates its small fixed template, not every production graph/reference invariant.
5. Reset; complete the required data, then click **Simulate another user's update** and attempt movement. Expect a stale-view conflict and no movement. **Refresh journey** and retry; it succeeds. This is a deterministic in-memory illustration, not a concurrent database test or durable idempotency implementation.
6. Reset; choose Lost without a reason and expect rejection. Supply a reason and expect unsuccessful terminal outcome. The sample does not silently set opportunity status to lost/won; the synchronization policy remains for review.
7. Switch to Read-only. Movement is disabled; design editing/publishing is disabled for all non-administrators. Every persona sees the same fictional board; real own/team scope is not simulated.
8. Preview Loading, Empty and Error; use Retry to return to Ready. Test with keyboard and at desktop/tablet/390px mobile widths. Columns scroll within the board; the page should not overflow horizontally.
9. Refresh the page or select Reset; confirm sample/draft/history return to the initial state. Nothing should be written to CRM, local storage or an external service.

## Feedback to capture before M3

- Confirm the separate completed-call activity gate and stage responsibilities; stage order, probabilities, durations and required fields have already been approved.
- Who may publish/archive/clone templates and who may enroll/move scoped opportunities? Confirm the proposed future permission mapping separately from the current four-role matrix.
- Does a successful/unsuccessful journey update opportunity status, require a separate confirmation, or allow other active customer journeys? How are deferred/paused states and re-entry handled?
- Review probability override/reporting semantics separately from the approved template percentages and elapsed-hour targets. An explicit 0% override must not fall back to stage probability.
- Are the keyboard movement, pinned-version explanation, outcome-reason and correction/error states understandable?

Record reviewer/date/findings against D12–D13 in the [M0 decision register](../m0-inception.md). No review/sign-off is inferred from opening the file or passing automated prototype checks.
