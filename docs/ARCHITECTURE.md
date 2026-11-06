# Module and API contracts

Holdfast is a browser application with an origin-local IndexedDB cabinet. The Node
server serves built assets; it does not receive purchase data. There is no backend
purchase API, authentication service, telemetry, or cloud synchronization.

## Verification and validation boundaries

Receipt extraction produces suggestions, never verified facts. Each selected
product requires independent fact, date and policy confirmation before saving.
Unknown policy must remain unknown; qualitative confidence is not verification.
See the [input rules](../README.md#input-and-rules) for supported files, limits,
per-item amounts and calendar conventions.

`validatePurchase` returns ordered, user-facing errors for purchase and policy
facts; it is not a runtime schema for arbitrary objects. `purchaseIssues` owns explicit fact/date/policy groups consumed by the verifier;
`validatePurchase` preserves the ordered message API for backup validation. Supported calendar years are
1900–2199; date arithmetic can throw for invalid or out-of-range inputs.
Checklist IDs are stored and exported, so keep them stable.

PDF.js reads only the text layer, preserving text order and explicit newlines.
Its loading task is destroyed in `finally`, including on failure. Failed or
unsupported file imports reject; textless PDFs and images retain the original
and require manual entry. Sample records and policies are fictional.

## Persistence APIs

All four APIs open `holdfast-v1` version 1, use the `purchases` store keyed by `id`,
and close their connection in `finally`. Validation belongs to the caller.

| API                                    | Success                                                                 | Failure                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadPurchases()`                      | All records ordered by descending `createdAt`.                          | Rejects database/read errors. Existing records are currently trusted without runtime schema validation.                                                     |
| `savePurchase(purchase)`               | One insert/update committed through idb's transaction-aware shortcut.   | Rejects the write/transaction failure.                                                                                                                      |
| `saveMany(purchases, replace = false)` | Entire batch committed; optional clear belongs to the same transaction. | Aborts on write failure, observes both write and transaction completion, waits for rollback, and preserves the causal error. No successful prefix survives. |
| `clearPurchases()`                     | Cabinet cleared after transaction completion.                           | Rejects the storage failure. The UI owns destructive-action confirmation.                                                                                   |

Bulk writes remain sequential in one transaction. Observe both the writer and
transaction completion immediately so a secondary abort rejection cannot hide
the causal write error or become unhandled. Synchronous write exceptions must
also abort the transaction. Ignore only `InvalidStateError` from an already
aborted transaction; surface any other rollback failure with the write error.
The [browser regressions](../test/e2e/storage.e2e.ts) exercise synchronous and
asynchronous failures, unchanged durable data and successful retries.

## Export and security boundaries

- Proof packets contain printable HTML, structured facts, receipt/policy/checklist
  text and original evidence bytes. Escape every user-controlled HTML value and
  sanitize member/download names. `safeName` and `escapeHTML` are not URL or
  authorization validators. Source labels remain plain text, never fetched URLs.
- Calendar export includes only confirmed, known dates, filtered by kind. Preserve
  RFC 5545 escaping and UTF-8 line folding to prevent field injection. Keep the
  [calendar privacy boundary](../README.md#privacy) when adding fields.
- [Backup contracts](BACKUPS.md) define validation before persistence, cancellation,
  format compatibility and resource budgets. Backup record validation uses Zod;
  ordinary IndexedDB reads currently trust stored objects without that boundary.
- I/O rejects at the operation boundary; the UI retains retryable input. Storage
  failures must not become successful partial results. Avoid logging receipt
  text, documents or backup contents.

`server.mjs` serves GET/HEAD with path containment, SPA fallback, `/health`, caching
and security headers. `public/_headers` supplies the Cloudflare Pages headers;
keep the two header policies aligned. Production assets, including lazy PDF and
backup code and the PDF worker, are precached locally. Development does not
register the offline cache.

## Refactoring and test priorities

1. Design recovery for historical v1 exports exceeding the retained byte budgets;
   do not imply that v2 chunking retroactively repairs that single-JSON format.
2. Bound receipt parsing and PDF extraction work; add cancellation and retain
   original-document and malformed-input tests. Backup extraction now relies on
   tested native output-size and CRC enforcement.
3. Keep validation groups with domain rules and confirmed policy-event selection
   shared between timeline and calendar. Keep queue orchestration with its modal
   selection and per-item saves in `App`.
4. Test corrupt stored data, replacement-batch rollback, tab concurrency, stale
   import completions, PDF cancellation, and recovery after a committed restore
   whose subsequent reload fails. Safari/Firefox remain unverified.

Purchase metadata projection belongs to `model.ts`, independent of backup schemas.
Evidence byte/count and receipt character budgets belong to `evidence.ts`.
`policy-events.ts` selects confirmed known dates; callers own outcome filtering.
