# M0 data dictionary

Sources: [schema](../../lib/db/schema.ts), [validation](../../lib/validation.ts), [access policy](../../lib/access/policy.ts), [conversion/configuration service](../../lib/domain/workflow.ts) and committed migrations `0000`–`0002`. “Current” describes code, not live database inventory. “Proposed” describes an M3/M4 design contract, not a migrated table.

## Shared meanings and formats

- `id`: database-generated UUID for business entities. User IDs are provider-owned text; the application does not create identities in Neon tables.
- `organizationId`: tenant UUID. Scoped reads require active membership and role visibility. Relation keys pair organization ID with the referenced ID.
- `ownerId`: assigned user, not tenant owner. `assignedTeamId` is optional and distinct from tenancy. New/changed assignments require an active same-tenant member and applicable team membership.
- `createdAt`/`updatedAt`: timezone-aware instants. `deletedAt`: logical deletion; deleted records stay in storage/audit but disappear from active reads.
- Missing optional relation IDs become SQL null; many optional free-text fields are stored as `""` rather than null.
- Names: CRM record inputs trim and require 1–160 characters; organization/team names allow 1–120. Notes: up to 5,000; phone: up to 50; job title/industry: up to 120. Catalog names: 1–160; SKU: up to 80.
- Tags: inline text arrays, at most 12 deduplicated labels of up to 40 characters, not separate tag tables. No custom field engine exists.
- **Confirmed pilot conventions:** PHP (two decimal places), Asia/Manila local display/business dates, elapsed time including weekends/holidays. Persist instants in UTC. **Current code:** USD formatting and UTC activity input; no complete organization timezone setting. Currency/timezone rollout remains [OPS-01](backlog.md).
- Money in current code: integer minor units, input range 0–9,999,999.99 (up to 999,999,999 minor units); no FX. Preserve currency provenance before accepting PHP data; never aggregate legacy USD and PHP. The organization currency column is not proof that legacy values were actually denominated consistently.
- `expectedClose` is an ISO date (`YYYY-MM-DD`), not a timestamp to shift between timezones. Percentages are integers 0–100. Manual score is not a conversion probability.

## Current access and operating tables

| Logical record | Physical table | Fields and constraints | Lifecycle/access notes |
| --- | --- | --- | --- |
| Organization | `crm_organizations` | `id`, `name`, optional unique `legacyOwnerId`, `timezone` (default UTC), `currency` (default USD), timestamps | One private organization per legacy owner; explicit invitations create sharing; no domain-based tenant merging |
| Membership | `crm_memberships` | Composite key `(organizationId,userId)`; name/email snapshots, `role`, `scope`, `revokedAt`, timestamps | Four fixed roles; own/team/organization enum; revocation and last-administrator checks are transactional; snapshots are not provider authentication authority |
| Team | `crm_teams` | `id`, `organizationId`, `name`, timestamps; tenant/name and tenant/ID unique | Team has memberships; role scope determines visibility, not an arbitrary department hierarchy |
| Team membership | `crm_team_memberships` | Composite `(organizationId,teamId,userId)`; tenant-aware team/member FKs | Team removal does not implicitly change existing record assignment |
| Invitation | `crm_invitations` | `id`, `organizationId`, email, role, unique `tokenHash`, `invitedBy`, `expiresAt`, `acceptedAt`, `revokedAt`, timestamps | Random token is stored only as SHA-256 hash; seven-day expiry; matching verified email; inviter must retain configure permission; raw token returned only for sharing |
| Audit event | `crm_audit_events` | `id`, `organizationId`, nullable `actorId`, action, entity, text `entityId`, JSON before/after, `createdAt` | Append-only update/delete/truncate triggers; mutation and audit commit together; administrator snapshots, scoped viewers receive event metadata only; provider login audit is not fabricated |

## Current business tables

All five assigned record types below have ID, organization/user/team assignment, timestamps and `deletedAt`. Product/source configuration has organization ID, timestamps and archive marker but no owner/team visibility; active workspace members can read it, administrators can configure it.

| Record | Table | Business fields | Allowed lifecycle and key rules |
| --- | --- | --- | --- |
| Account/company | `crm_companies` | name, website, industry, lifecycle, phone, address, notes, tags | `prospect`, `customer`, `inactive`; website empty or HTTP(S) URL; logical deletion blocked by active directly linked contacts, opportunities or activities |
| Contact | `crm_contacts` | name, email, phone, role/job title, notes, lifecycle, tags, optional `companyId` | `prospect`, `customer`, `inactive`; valid email required; multiple opportunities may reference the contact; no automatic duplicate merge |
| Opportunity/deal | `crm_deals` | name, `value` (`value_cents`), legacy stage, independent status, probability, `expectedClose`, optional `sourceId`, `contactId`, `companyId`, notes, tags | Status `open`, `won`, `lost`; legacy stage `Lead`, `Qualified`, `Proposal`, `Won`, `Lost`. Explicit status controls open pipeline; when omitted by older service callers it derives from stage. M2 migration maps old Won/Lost stages to corresponding status |
| Lead | `crm_leads` | name, email, phone, companyName, role/job title, status, sourceId, score, scoreReason, notes, tags; conversion fields below | Editable statuses `new`, `working`, `qualified`, `disqualified`; `converted` is service-controlled; score 0–100 and nonzero score requires explanation. Lead email is lowercased on input; duplicates remain warnings |
| Activity | `crm_activities` | name, type, priority, status, dueAt, completedAt, outcome, notes, optional leadId/contactId/companyId/dealId | Types task/call/meeting/email/note; priority low/normal/high; status open/completed/cancelled. Completion requires outcome and timestamp. Repeated completed edits preserve timestamp; reopening clears it. Relations must be same-tenant and visible when newly set; unlinked activity is allowed |
| Product | `crm_products` | name, SKU, `price` (`price_cents`) | Nonnegative unit price; tenant/name unique; archive preserves prior opportunity lines. Names remain reserved after archive |
| Opportunity product | `crm_opportunity_products` | Composite key `(organizationId,dealId,productId)`, integer quantity and snapshotted `unitPrice` (`unit_price_cents`) | Quantity 1–10,000 in storage; command quantity zero removes. Catalog repricing does not alter snapshot. Line totals do not overwrite opportunity value |
| Lead source | `crm_lead_sources` | name | Tenant/name unique; archive preserves existing links; no campaign model |

### Conversion provenance

A converted lead stores `convertedAt`, `convertedBy`, `convertedContactId`, nullable `convertedCompanyId`, and nullable `convertedDealId`. Database checks pair converted status/timestamp with a contact and actor. The service stores all links atomically with business/audit writes and returns the same result on retry. Converted leads are read-only except permission-controlled logical deletion. Existing matched records are not overwritten; no other lead/email is automatically merged. Conversion does not assert account/contact customer lifecycle or a successful funnel outcome.

### Current versus intended identity guarantees

Neon owns passwords, sessions and verification tokens. They must not be stored in CRM tables or this dictionary. Current `requireUser` establishes session presence; verified-email checking is explicit during invitation acceptance, not explicit at every protected route. Provider enforcement and a dedicated verification journey require acceptance work. The M0 document does not upgrade a session check into a claimed verified-session guarantee.

## Proposed M3 design/execution contracts

Names below are conceptual; physical schema belongs to M3 review/migration. All business rows carry organization ID. Draft edits, semantic rules and visual layout are separate concerns.

| Proposed record | Required contract | Integrity/semantics |
| --- | --- | --- |
| Funnel | Stable ID, tenant, name, lifecycle, creator, draft reference, archivedAt | Archive definitions with references; cloning yields a separate draft |
| Funnel version | Funnel ID, immutable version number, publishedAt/by, validated semantic snapshot, template provenance | Published snapshot never mutates; active journeys remain pinned to their version |
| Stage definition | Stable version-local ID, label/order, entry or terminal type, probability, target elapsed hours, responsible role, required standard fields/activities | Explicit entry, reachable stages and successful/unsuccessful terminals; durations/probabilities do not invent historical data |
| Transition definition | Version-local source/target IDs, allowed rule and required abnormal-exit reason | Ordered forward transitions plus explicit terminal exits for MVP; conditional branching later |
| Layout | Version/draft reference, visual position/order | Visual edits cannot silently alter transition semantics; publish validates semantic graph |
| Funnel instance | Tenant, opportunity, immutable version ID, active/terminal state, outcome, revision | Default one active per opportunity (`BR-004`); status/stage/outcome remain distinct; define paused behavior before schema freeze |
| Stage visit | Instance, versioned stage ID, entry/exit UTC instants, actor/source, baseline/unknown-entry marker | One open visit per active instance; repeated entry creates another visit; migration baselines excluded from duration claims |
| Transition event | Command/idempotency key, instance, expected/committed revision, source/target, actor, UTC timestamp, reason, source, correlation ID | Same command retry returns same result; competing revision loses with conflict; atomic history/visits/audit/outbox |

## Proposed M4 automation contracts

| Proposed record | Required contract |
| --- | --- |
| Workflow definition/version | Tenant, stage-entry trigger, typed conditions/actions, immutable published version and authorized execution context |
| Outbox event | Business-transaction event ID, tenant, type, version/subject IDs, correlation ID, createdAt, availableAt, status, attempts, lease owner/expiry |
| Automation/action run | Unique event + workflow version + action identity, attempts/result/error category, original permission/provenance context |
| Scheduled job | AvailableAt UTC, lease, attempt policy, deduplication identity, failure inspection/replay history |
| Notification | Tenant/recipient, subject reference, type, createdAt/readAt; subject visibility rechecked when opened |

M0 specifies these contracts and tradeoffs only. It creates none of these production records, migrations or workers.
