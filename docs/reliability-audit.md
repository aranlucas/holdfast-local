# Reliability audit — 2026-11-06

Baseline: remote default `origin/main`, `960d837b1d0afdec2867cfc51a5e0100cb2ef846`.
Clean isolated worktree; no structural cleanup. Tests and builds run only in CI.

## Inventory and boundaries

- `app.tsx`, importer/picker/verifier: receipt -> conservative suggestions -> independent human confirmation -> durable save. Draft cancellation keeps already saved items.
- `model.ts`, extraction, receipt-items: calendar arithmetic (1900–2199), policy unknowns, currency/amount and multi-item attribution. PDF.js and original Blobs remain local; extraction destroys its task.
- `storage.ts`: origin-local IndexedDB, transaction-aware single writes and atomic bulk writes; connections close in finally. No accounts, tenants, auth service, remote purchase API, or payment transactions exist.
- backup/schema/archive/set: untrusted ZIP/JSON -> Zod and byte/count/CRC/hash checks -> complete in-memory validation -> atomic persistence. Multipart order, missing parts, cancellation and legacy compatibility are covered by existing tests.
- detail/exports/calendar/timeline: checklist, notes and reversible outcomes, escaped printable HTML and ZIP originals; calendar omits private receipt fields. Downloads do not submit claims.
- server/PWA/config/CI: static GET/HEAD server, containment, same-origin security policy, precache of lazy modules/worker, local-only browser journeys. No production changes/deployment.

## Findings recorded before behavior changes

### R1 — false notes-save acknowledgement (medium, high confidence)

`src/detail.tsx`, notes/serial inputs and Save notes handler: start a slow IndexedDB write, edit either field before it finishes. The pending handler saves its earlier snapshot then marks the newer visible fields “Notes saved”. Expected: the acknowledged visible values match the committed snapshot. Prevent edits while the write is pending, consistent with other detail controls. Regression uses a controlled real IndexedDB transaction delay; no timing sleeps.

### R2 — committed restore is reported as failed when refresh fails (medium, high confidence)

`src/app.tsx`, restore: `saveMany` commits before `loadPurchases`; a read failure rejects the same operation and leaves the old shelf displayed. Expected: report the committed restore accurately and offer a storage refresh retry. Do not retry writes blindly or suggest unchanged storage. Existing architecture explicitly calls out this recovery gap. Regression injects one post-commit read failure, verifies persisted data, retry and unchanged unrelated purchases.

### R3 — valid extension metadata breaks proof export (medium, high confidence)

Independent review: `backup-schema.ts` intentionally preserves extension fields with passthrough, while `exports.ts` iterates every evidence entry as an Evidence object. A valid imported record with `evidence.futureField = null` crashes printable/proof export. Render only the four defined evidence fields while preserving extension metadata in structured exports. Unit regression imports a real backup carrying the extension, then verifies HTML and ZIP output.

## Rejected hypotheses and limits

- Detail state leaking across purchases: rejected; `key={detail.id}` remounts it.
- Partial restore writes: rejected; saveMany explicitly aborts synchronous failures and observes tx.done; existing real-browser regressions cover synchronous/asynchronous rollback and retry.
- Missing PDF cleanup and unescaped packet HTML: rejected; task destroy is in finally and HTML values use escapeHTML.
- Calendar policy disagreement: shared policyEvents selects both timeline/calendar dates; outcome filtering belongs to caller.
- Ordinary stored objects are trusted (documented existing contract), multi-tab last-write-wins and browser eviction remain limitations; no speculative migration or conflict-resolution requirement added.

## Validation and framework applicability

Preserve existing Vitest, Playwright, lint, tooling checks and production build in CI. Add the real tester-army `e2e` 0.23.0 with `@e2e-dev/web` 0.15.5 (published registry versions verified, Node ^22.22.3 or >=24.8; repo CI Node 24.22.1). Read current quickstart, CI/GitHub Actions, browser docs and upstream skill/setup references. Web is a supported faithful target; no native engine applies. Deterministic actions/assertions use no model, paid service or credentials. Add a durable sample -> edit -> reload -> backup -> clear -> restore journey, preserving deeper original-byte/offline Playwright coverage. CI artifacts retain failure evidence. CI must also demonstrate regressions fail against baseline, separately from fixed-head validation. Results pending.

Independent same-provider review challenged findings and reviewed the final fixes,
regressions and journey; no remaining concrete objections. Static lint identified
spacing/unsafe test metadata access, corrected before push. No local tests/builds
were run; installation used `--ignore-scripts`. New dependencies implement the
explicitly requested supported web runner, with exact engine/runner lockfile pins.
