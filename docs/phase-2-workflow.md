# Phase 2: CRM operating workflow

Implemented 21 October 2026. Phase 2 means milestone M2 in the implementation plan. This is an implementation record; live deployment and product acceptance remain separate gates.

## Scope and field defaults

The referenced BRD sections 13–16 are not present in this repository. The fields below implement the M2 description and are explicit defaults pending comparison with that source. M0 is not marked complete.

- Leads: name, email, phone, job title, company name, new/working/qualified/disqualified status, lead source, manual score (0–100) with explanation, notes, simple tags, user/team assignment and conversion provenance. `converted` is a service-controlled terminal lead state.
- Accounts retain the `crm_companies` table and `/companies` URLs: name, website, industry, phone, address, prospect/customer/inactive lifecycle, notes and tags.
- Contacts: existing fields plus prospect/customer/inactive lifecycle and tags. Creating an opportunity does not assert that a prospect has become a customer; users set customer lifecycle explicitly.
- Opportunities retain `crm_deals`, IDs and `/deals` URLs: value in USD minor units, independent open/won/lost status, expected close date, manual probability (0–100), source, related contact/account, notes and tags. Existing five-value stage remains a legacy field until M3; status controls open-pipeline counts. No funnel history is invented.
- Products: administrator-maintained name, SKU and unit price. Opportunity lines store quantity and a snapshot of unit price. Later catalog edits do not change historical line prices. Quantity zero removes a line; archived products remain visible on existing lines and can be removed. Opportunity value remains independently entered and is not silently overwritten by product totals.
- Sources: administrator-maintained names. Products/sources can be edited or archived, with audit. Names remain reserved after archival. Configuration and record choices have search and 50-row pagination.
- Activities: task, call, meeting, manual email or note; assigned user/team, due date, low/normal/high priority, open/completed/cancelled status, notes and outcome. Completion requires an outcome and records a stable completion timestamp. Reopening clears it; earlier completion remains in audit. Due-date input explicitly uses UTC; expected close is a date without a timezone.
- Simple tags are comma-separated input, deduplicated, at most 12 labels of 40 characters. These are record labels, not an administrator tag taxonomy or custom fields.

Money preserves the existing USD default and maximum 9,999,999.99 per unit/opportunity, stored exactly as integer cents. Mixed currencies, currency settings, automatic scoring/assignment, funnel design/history, automation, mailbox integration and richer reporting are outside this phase.

## Conversion and access

Conversion is one transaction using the existing organization lock. It checks current membership, create permission and lead visibility, validates visible existing matches, creates contact/account/optional opportunity, appends audit for each write, and stores conversion timestamp, actor and result IDs on the lead. Repeating or concurrently submitting conversion returns the stored result without additional records or audit events. An audit failure rolls back every conversion write.

Conversion may create a new contact or match an existing contact, and match an account or create one from the lead company name. Existing matched records are not overwritten. A matched contact's existing account must be visible and agree with an explicitly selected account. Account creation is skipped when matching a contact without an account; conversion does not silently relink that contact. Disqualified leads must first return to an eligible status. Converted leads are read-only (logical deletion remains permission-controlled); their linked records can be edited independently.

New converted records are assigned to the converting user, not silently copied to a potentially inactive lead owner. The original lead assignment and conversion actor remain recorded. Every new relation uses same-tenant foreign keys and server-side visibility validation. Normal record reassignment continues through Phase 1 active-member/team checks.

Possible duplicate warnings use exact, case-insensitive email or account-name matches in current visibility only. They do not auto-merge or prohibit intentional duplicates. New-record screens offer a duplicate check before filling the form; existing-record screens show matching records. Conversion's matching selectors and catalog/relationship selectors can be searched and paginated. Changing search reloads unsaved form fields and the UI says so.

## Customer 360

Record pages show visible related contacts/opportunities, scoped activities/manual communications, conversion links, and paginated record event metadata. Account activities include directly linked activities plus activities linked to currently visible contacts/opportunities; contact activities also include linked visible opportunities. Activity visibility is checked independently. Customer 360 sections, including product lines and related records, share a page selector with up to 50 entries per section; counts and next/previous controls include every section. Main record lists remain available for search and pagination.

Business viewers receive event names/timestamps only, never raw audit snapshots. The existing administrator audit screen retains before/after detail. Conversion links resolve through current visibility. There is no historical stage-movement timeline until M3, and no automated events until M4. Existing records do not receive invented historical events.

## Migration and rollout

1. Rehearse a restorable backup and Phase 1 rollout prerequisites first.
2. Point `DATABASE_URL` at a disposable development branch. Run `npm install`, then `npm run db:migrate` explicitly. Startup never migrates or seeds.
3. `0002_crm_operating_workflow.sql` adds tables/fields/tenant constraints, leaves existing IDs/URLs/values intact, and maps legacy Won/Lost stages to won/lost status; other stages become open. Lifecycle defaults to prospect and probability to zero without guessing customer history.
4. Reconcile counts and company links, check legacy values are nonnegative and within the documented money range, exercise representative/manager/read-only accounts, conversion matching and rollback, sources/products and activities.
5. Rehearse real Neon sessions, browser flow and backup restoration before deploying the same migration/application together. Old application writes do not maintain the independent new status; avoid mixed-version writes after rollout. Prefer forward fixes after new-model writes.

No live Neon migration, backup restore or deployment was performed during implementation.

## Verification

Recorded result: lint, TypeScript, production build, schema-drift check, 16 validation/PGlite tests, two PostgreSQL 17 tests and two Chromium journeys passed. The disposable PostgreSQL container was used only for isolated test data.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- PGlite tests cover populated legacy migration plus new workflow validation, idempotent conversion/matching/provenance, transaction rollback, catalog snapshots/archival, completion outcomes, tenant foreign keys, visibility, duplicate warnings and timeline pagination.
- `PHASE1_TEST_DATABASE_URL=<dedicated PostgreSQL database named splash_phase1_*> npm run test:postgres` verifies actual adapter migrations, repeated/concurrent conversion, audit rollback and existing access concurrency. The environment variable name is retained for compatibility with the existing test safeguards.
- `PHASE1_TEST_DATABASE_URL=<same dedicated database> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` exercises capture → conversion → opportunity fields/products → completed activity → Customer 360, and the existing workspace invitation/read-only/revocation journey. The browser tests use the real application/SDK and local PostgreSQL with a test-only Neon HTTP identity simulator; this is not live Neon authentication evidence.
