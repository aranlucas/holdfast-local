# Untangle decision log

Scope: entire Holdfast repository in the bound isolated worktree. Exact skill fetched
from https://raw.githubusercontent.com/caldoai/skills/main/skills/untangle-codebase/SKILL.md
on 2026-11-05. Comments and Tests additions both selected by the user. Initial git
status clean. No deployment, publication, dependency changes or custom scripts planned.

## Inventory before implementation

- `model.ts`: purchase types/defaults, calendar arithmetic, policy deadlines/status,
  and ordered validation. `verifier.tsx` classifies validation prose with regex.
- `app.tsx`: cabinet loading/writes, receipt queue, environment status and shelf UI.
  Initial and retry loading duplicate behavior and storage error text. Queue state
  stays here: it coordinates modal selection and per-item durable saves.
- `extraction.ts`, `receipt-items.ts`, importer/picker: conservative receipt/PDF
  suggestions, shared original evidence, independent unconfirmed product policies.
- `detail.tsx`, timeline, privacy and ui: editing/export, dates, abortable backup
  operations and accessible native dialogs. Timeline independently builds events
  already selected by calendar export, with different confirmation eligibility.
- `calendar.ts`, `exports.ts`: RFC 5545 serialization and printable/ZIP proof.
  Proof imports `backup-schema.ts` just for metadata, coupling it to backup/Zod.
- Four backup modules separate schema, bounded native ZIP I/O, indexed volume
  identity and versioned record reconstruction. Evidence size/count limits repeat
  in extraction, detail and backup schemas/archive.
- `storage.ts`: idb atomic writes, deliberate sequential batch writes and rollback.
- Samples/styles/main, server, Vite/PWA, deployment and tooling config inspected as
  independent presentation/bootstrap/hosting concerns. Existing docs explain
  persistence, security, calendar and backup contracts. No generic framework needed.
- Tests cover date boundaries, unknown policy, extraction provenance, independent
  items, calendar interoperability/privacy, ZIP corruption/cancellation, atomic
  storage rollback, offline behavior, accessibility and retryable UI flows.

## Coherent fixes (approved by repository evidence)

1. Own validation grouping with validation rules. Replace verifier prose matching
   with typed fact/date/policy issues; preserve ordered messages for existing callers.
   Hidden link: English copy currently determines whether a wizard step may advance.
2. Own confirmed policy events in a domain selector shared by timeline and ICS.
   Hidden link: duplicate event enumeration and filter rules can show dates that
   the export omits. Keep timeline active-only; detail exports retain closed records.
3. Own metadata projection with purchase data, outside backup validation.
   Needless link: proof packet export imports the backup schema for a pure projection.
4. Own attachment size/count budgets with evidence data, reused by import, editing,
   backup schema and extraction. Hidden link: accepted originals must remain restorable.
   Preserve distinct receipt MIME recognition and evidence extension validation.
5. Use one cabinet loading operation for mount and retry. Hidden link: duplicate
   success/error behavior. Keep all-or-nothing storage operations and retryable drafts.
6. Comments pass: remove implementation-only narration; retain external contracts,
   security boundaries, transaction semantics and lint explanations.
7. Tests last: retain behavioral regressions; give genuinely large backup roundtrip
   a targeted timeout rather than weakening data/byte assertions.

## Required special cases retained

Unknown/none/exact/duration policies represent distinct user facts; day-zero/day-one,
month-end clamping, supported years and local today preserve calendar semantics.
Receipt MIME/extension recognition, ambiguous dates, original-only images/textless
PDFs and PDF password errors preserve conservative/manual entry. Backup v1/v2 paths,
CRC/size/member checks, split index hashes and abort identity checks protect data.
IndexedDB rollback handles both sync and async native failure modes. Download URL
revocation delay allows browser downloads to consume bytes. Sample icon choices are
presentation, not a domain taxonomy. Native dialog focus restoration is intentional.

## Baseline validation

`pnpm test`: 79 passed, 1 failed of 80. Only failure: 501-purchase empty-receipt
round trip exceeded default 5000 ms (5020 ms). Full run 41.57 s. Retain assertions;
recheck with explicit large-operation timeout in final test cleanup.

## Review and final validation

Implementation and independent review rounds completed; see findings and responses
below. Baseline failures above are separate from introduced development failures.

## Inventory review responses

Independent inventory review confirmed fixes 1–5. Also centralize receipt character
limits across extraction/import UI, remove the import sequence guard (only incremented
by drop, no invalidation/cancellation path), and remove the Vitest narration comment.
Keep policy textarea's coincidentally equal character cap separate: editing policy
text is not receipt parsing. Keep server and Pages security policies in their native
representations: replacing them requires a new parser or build-generation mechanism
for a stable deployment boundary. Existing architecture explicitly documents this
cross-platform alignment requirement; no new runtime/build coupling is justified.
The queue and shelf remain local to App: no second consumer or independent lifetime
justifies a new generic hook/state framework. No tests warrant wholesale deletion.

## Implementation review and test rationale

Final independent review (resumed after thread restart) found no correctness
regressions or further worthwhile structural changes. Its remaining surplus finding,
a retry `.catch` after the load operation already handles errors, is removed.
Reviewer requested focused validation group and closed-record selector coverage;
these now protect wizard routing, rule-required delivery input and caller-owned
outcome filtering. A policy end earlier than purchase belongs to policy verification,
where it can be corrected; it no longer blocks the preceding date step merely
because its message contains “purchase date”. Timeline now omits unconfirmed dates,
matching the confirmed-only export boundary.

New tests use concrete invalid facts and expected user-facing groups/messages. They
catch assigning an issue to the wrong wizard step, silently dropping required delivery
input, and accidentally making the event selector active-only (detail exports must
still work for closed purchases). Existing independent ICAL parser tests protect
unknown/none/unconfirmed/kind-filtered event behavior.

Test cleanup retained all meaningful tests. Malformed object rejection no longer
asserts Zod's internal diagnostic code. Complete-cabinet backup integration tests
retain full equality/bytes assertions with a native Vitest suite timeout of 120s:
baseline 5s and resumed 30s budgets timed out under machine load around 25 with swap
in use; a CLI timeout did not override the earlier explicit per-test 30s budget.
No production performance contract specifies those wall-clock thresholds.

Introduced development failure: the new earlier-policy-end test initially used an
end date after the synthetic fixture's purchase (sample receipt subtracts 25 days).
The test now sets an explicit purchase date and earlier end date. No production
change was made to accommodate that mistaken fixture.

## Validation results

- `pnpm test`: 84/84 passed (five files), including the complete-cabinet and
  multipart byte-preservation regressions. 173.41s under shared-machine load.
- `pnpm lint`, `pnpm check:format`, `pnpm build`: passed after addressing
  introduced duplicate imports, spacing and promise-handling lint findings.
  Cabinet loading owns its promise chain and reports all errors asynchronously,
  shared between mount/retry. Timeline arithmetic uses guaranteed selected dates.
- Cached Playwright headless Chromium cannot run even `--version` (SIGSEGV;
  binary reports missing section headers). Initial browser tests failed at launch,
  before application execution. System Chromium is being used through the existing
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` configuration, without repository changes.

No dependency, runtime script, platform deployment or security policy changes.
Independent reviews found no remaining worthwhile structural changes after the
small retry-handler surplus fix. Remaining platform/domain cases and deferred
product work are documented above and in ARCHITECTURE.md.

- Final browser run: 19/19 passed (2.1 minutes), system Chromium at
  `/usr/bin/chromium`, production app at `http://127.0.0.1:4319`, one worker.
  Covers desktop/mobile, accessible dialogs, offline PDF/cache, verification,
  multi-item cancellation and retry, proof/calendar privacy, multipart backup and
  native IndexedDB rollback. Cached headless-shell launch failure is an environment
  limitation only; no production workaround was introduced. Firefox/Safari remain
  unverified as before.
