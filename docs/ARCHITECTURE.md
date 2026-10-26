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
| `exportBackup(purchases)`                        | Version-1 JSON manifest plus evidence keyed by purchase and attachment IDs. Resolves to a ZIP Blob.                                                                                                         |
| `validateBackupRecord(value)`                    | Zod boundary for one manifest record; throws for invalid structure, duplicate attachment IDs, or invalid purchase facts.                                                                                    |
| `importBackup(file)`                             | Validate ZIP manifest, unique IDs, evidence presence/advertised sizes, then reconstruct Blobs. It does not save anything.                                                                                   |
| `downloadBlob(blob, name)`                       | Trigger a local download; remove the anchor and revoke its object URL after ten seconds.                                                                                                                    |
| `calendarEvents`, `calendarText`, `calendarBlob` | Confirmed, known dates as all-day RFC 5545 events, filtered by kind. Text escaping and UTF-8 line folding prevent field injection. Unknown/no-window rules and private receipt/document fields are omitted. |

**Current backup limitation:** imports accept at most 500 purchases, a 5 MiB
manifest, a 60 MiB compressed archive, and 60 MiB of total referenced evidence
(12 MiB per attachment, ten attachments per purchase). Export does not yet enforce
or partition these aggregate limits. A successful download from a large cabinet
can therefore fail to restore. Keep existing data until a restore has been
verified; multipart backup/restore is an open implementation item.

ZIP size checks currently inspect JSZip's advertised uncompressed metadata.
They do not constitute a measured limit on actual decompression memory. Streamed
byte limits and hostile compressed-archive fixtures remain a security follow-up.

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

1. Make backup export/restore limits symmetric, including large cabinets and
   duplicated evidence across item drafts; preserve existing version-1 imports.
2. Bound actual ZIP output and receipt parsing work. Reject or cancel excess work
   before accumulating it; retain original-document and malformed-input tests.
3. Extract typed fact/date/policy validation groups from `validatePurchase`, keeping
   error order and messages until the verifier uses structured issues. Separate
   shelf selectors and persistence/queue orchestration from `App`.
4. Test corrupt stored data, replacement-batch rollback, tab concurrency, stale
   import completions, PDF cancellation, and recovery after a committed restore
   whose subsequent reload fails. Safari/Firefox remain unverified.

Use existing Vitest and Playwright files, native TypeScript/Oxlint commands, and
declarative configuration. Do not add a separate audit runner. Measure classic
complexity per function; helper extraction reduces local paths without necessarily
removing decisions. Storage and browser tests have a native maximum of 9. The
larger application hotspots still require follow-up; this gate does not imply
that the entire runtime is below 10.
