# Module and API contracts

Holdfast is a browser application with an origin-local IndexedDB cabinet. The Node
server serves built assets; it does not receive purchase data. There is no backend
purchase API, authentication service, telemetry, or cloud synchronization.

## Data flow and ownership

1. `Importer` accepts receipt text or a file. `extraction.ts` constructs an unconfirmed
   `Purchase`; `receipt-items.ts` suggests independent products where possible.
2. `ReceiptPicker` creates up to 20 drafts. `Verifier` requires explicit fact, date,
   and policy confirmation before handing a purchase to `App`.
3. `App` owns the loaded cabinet, selection, verification queue, and persistence
   callbacks. `storage.ts` owns database transactions. Components receive records
   and callbacks rather than database connections.
4. `Detail`, `Timeline`, and the shelf derive recorded dates from `model.ts`.
   Exports read the same records and retain their source evidence.
5. `Privacy` parses a complete backup before invoking the atomic bulk save. IDs
   merge into the current cabinet; unrelated purchases remain.

`Purchase` combines user-confirmed facts, `Policy`, four `Evidence` entries,
checklist/outcome state, timestamps, and `Attachment` metadata with original Blobs.
`Deadline` represents known, unknown, or explicitly absent coverage. Unknown
policy must remain unknown; extraction confidence is a suggestion, not verification.

## Domain APIs

| Module             | Public surface                                                       | Contract                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`         | `blankPolicy`, `blankEvidence`, `blankPurchase`, `CHECKLIST`         | Fresh editable defaults and stable checklist IDs. Purchase IDs use `crypto.randomUUID()`.                                                                                                                             |
| `model.ts`         | `isDate`, `dayNumber`, `addDays`, `addMonths`                        | ISO calendar dates, UTC arithmetic, clamped month ends. Invalid inputs can throw; supported input years are 1900–2199.                                                                                                |
| `model.ts`         | `todayInZone`, `formatDate`, `daysLeft`, `money`                     | Display helpers. Supply a fixed date/time zone in deterministic tests. A missing deadline stays absent.                                                                                                               |
| `model.ts`         | `returnDeadline`, `warrantyDeadline`, `returnStatus`                 | Derive planning dates/status from the purchase's own policy, start date, and outcome. No merchant eligibility is inferred.                                                                                            |
| `model.ts`         | `validatePurchase`                                                   | Ordered, user-facing error strings for purchase and policy facts. It is not a complete runtime schema for arbitrary stored objects.                                                                                   |
| `extraction.ts`    | `extractReceipt(text, label?)`                                       | Conservative labeled/likely facts and source lines. Receipt text is limited to 100,000 characters; returned facts require confirmation.                                                                               |
| `extraction.ts`    | `MAX_FILE_BYTES`, `readReceiptFile(file)`                            | Up to 12 MiB; text/Markdown, PDF, PNG/JPEG/WebP. PDF.js loads locally and its task is destroyed in `finally`. PDFs allow at most 20 pages. Images retain the original without OCR. Unsupported/failed imports reject. |
| `extraction.ts`    | `pdfPageText(items)`                                                 | Preserve PDF text order and explicit newlines while ignoring marked-content boundaries.                                                                                                                               |
| `receipt-items.ts` | `ReceiptItem`, `receiptItems(text)`, `itemDraft(receipt, candidate)` | Suggest line items and amounts. Independent drafts retain source evidence and documents; shared totals/tax are not allocated and policy defaults remain unknown.                                                      |
| `samples.ts`       | `sampleText`, `samplePolicy`, `demoPurchases`                        | Explicitly fictional examples, with injectable calendar dates. They are not merchant policy data.                                                                                                                     |

## Persistence APIs

All four APIs open `holdfast-v1` version 1, use the `purchases` store keyed by `id`,
and close their connection in `finally`. Validation belongs to the caller.

| API                                    | Success                                                                 | Failure                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadPurchases()`                      | All records ordered by descending `createdAt`.                          | Rejects database/read errors. Existing records are currently trusted without runtime schema validation.                                                     |
| `savePurchase(purchase)`               | One insert/update committed through idb's transaction-aware shortcut.   | Rejects the write/transaction failure.                                                                                                                      |
| `saveMany(purchases, replace = false)` | Entire batch committed; optional clear belongs to the same transaction. | Aborts on write failure, observes both write and transaction completion, waits for rollback, and preserves the causal error. No successful prefix survives. |
| `clearPurchases()`                     | Cabinet cleared after transaction completion.                           | Rejects the storage failure. The UI owns destructive-action confirmation.                                                                                   |

Bulk writes remain sequential inside one native transaction so a failed operation
stops subsequent writes. `Promise.allSettled` observes the writer and `tx.done`
together; this handles the transaction's secondary rejection without hiding the
original request error. An already aborted transaction may reject `abort()` with
`InvalidStateError`; any other rollback failure is surfaced with the write error.
The browser regressions exercise both synchronous and asynchronous failures,
unchanged durable data, and successful retries against real IndexedDB.

## Export APIs and boundaries

| API                                              | Contract                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safeName`, `escapeHTML`                         | Sanitize download/member names and escape generated HTML values. Neither is a general-purpose URL or authorization validator.                                                                               |
| `packetHTML(purchase)`                           | Offline printable proof; user-controlled values are escaped.                                                                                                                                                |
| `exportPacket(purchase)`                         | ZIP containing HTML, structured facts, receipt/policy/checklist text, and original evidence bytes.                                                                                                          |
| `exportBackup(purchases, options?)`              | Version-2 native ZIP volume set; resolves to named Blobs, including a required external index for multipart backups.                                                                                        |
| `validateBackupRecord(value)`                    | Zod boundary for one manifest record; throws for invalid structure, duplicate attachment IDs, or invalid purchase facts.                                                                                    |
| `importBackup(files, options?)`                  | Validate complete membership, hashes, metadata, sizes, CRC and original bytes before returning all records. It does not save anything.                                                                      |
| `downloadBlob(blob, name)`                       | Trigger a local download; remove the anchor and revoke its object URL after ten seconds.                                                                                                                    |
| `calendarEvents`, `calendarText`, `calendarBlob` | Confirmed, known dates as all-day RFC 5545 events, filtered by kind. Text escaping and UTF-8 line folding prevent field injection. Unknown/no-window rules and private receipt/document fields are omitted. |

`backup.ts` owns record identity, metadata chunking and reconstruction. `backup-schema.ts`
owns the Zod record and descriptor contracts shared with proof packets.
`backup-archive.ts` delegates splitting, compression, ZIP parsing, CRC, overlap and
actual output-size enforcement to pinned zip.js 2.24.0. `backup-set.ts` binds a
multipart selection to an external ordered SHA-256 index using native Web Crypto.
`Privacy` owns the cancellable operation and explicit per-file download controls.
The library is loaded on demand and precached for offline operation.

New backups have no cabinet-wide record/metadata/evidence cap. Per-volume and
per-entry limits remain; the complete cabinet and staged Blobs still occupy memory.
Legacy v1 backups remain readable within their 5 MiB manifest and 60 MiB archive /
evidence limits, now with actual output/CRC checks. The old 500-record limit is
removed. This does not recover every historical oversized v1 export. See
[backup contracts and compatibility](BACKUPS.md) for format, limits, ownership,
examples and regression coverage.

## UI, server, and errors

`App` owns mutations and optimistic state. `Verifier` owns the three confirmation
steps; `Detail` owns purchase preparation; `Timeline` owns date filtering;
`Privacy` owns backup/restore/clear controls. `Modal` handles native dialog focus
and Escape, `Field` connects labels/hints, and `Notice` displays operation feedback.
`main.tsx` mounts React with Strict Mode. `vite.config.ts` precaches production
assets and the PDF worker; development does not register the offline cache.

`server.mjs` is the product's dependency-free static HTTP server, also shipped
with portable builds. It handles GET/HEAD, health checks, path containment, SPA
fallback, content types, caching and security headers. Keep this runtime behavior;
it is not an obsolete build wrapper. `public/_headers` provides host-side headers
for Cloudflare Pages.

Pure validation returns actionable input errors; I/O rejects; the UI catches at
the operation boundary and retains retryable input. Storage failures must not be
converted into successful partial results. Avoid logging receipt text, documents,
or backup contents. Future structured validation should expose stable field/step
codes: the verifier currently classifies English error messages to choose a step.

## Refactoring and test priorities

1. Design recovery for historical v1 exports exceeding the retained byte budgets;
   do not imply that v2 chunking retroactively repairs that single-JSON format.
2. Bound receipt parsing and PDF extraction work; add cancellation and retain
   original-document and malformed-input tests. Backup extraction now relies on
   tested native output-size and CRC enforcement.
3. Extract typed fact/date/policy validation groups from `validatePurchase`, keeping
   error order and messages until the verifier uses structured issues. Separate
   shelf selectors and persistence/queue orchestration from `App`.
4. Test corrupt stored data, replacement-batch rollback, tab concurrency, stale
   import completions, PDF cancellation, and recovery after a committed restore
   whose subsequent reload fails. Safari/Firefox remain unverified.

Use existing Vitest and Playwright files, native TypeScript/Oxlint commands, and
declarative configuration. Do not add a separate audit runner. Measure classic
complexity per function; helper extraction reduces local paths without necessarily
removing decisions. Storage, backup modules, device controls and browser tests have a native maximum of 9. The
larger application hotspots still require follow-up; this gate does not imply
that the entire runtime is below 10.
