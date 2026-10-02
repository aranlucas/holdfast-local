# QA evidence

Production app: http://127.0.0.1:4319. Chromium for Testing on macOS; desktop 1440 × 1000, mobile 390 × 844. Browser date zone UTC; extra contexts tested America/Los_Angeles and Pacific/Kiritimati. Tests use one browser worker and synthetic/user-entered test data only.

The in-app browser was tried first but its tool transport became unavailable (`Transport closed`). The task explicitly requested real browser testing, so installed Playwright Chromium was used as the fallback. No gh authentication failures were repeated.

## Passed

- 56 unit tests: valid/invalid dates, leap days, DST boundaries, year boundaries, clamped warranty months, day 0/day 1, missing delivery input, exact overrides, unknown/none rules, per-product policies, source scope, reversed dates, range bounds, extraction evidence, ambiguous dates, unspecified currency, source escaping, safe names, original bytes and backup validation/round trips; multi-item line suggestions and independent policies; RFC 5545 parsing, leap/month-end/exclusive ends, UTF-8 folding, injection, unknown/unconfirmed omissions and calendar privacy.
- 13 browser scenarios: shelf/search/filters/timeline; three-fact gating and ambiguous date correction; delivery start and inclusive day count; editing back to unknown; text-layer PDF and unsupported-file retry; attachment export bytes and reload persistence; backup/restore/clear and reversible returned outcome; first-use PDF import with network disabled; offline save/export/reload; mobile layouts and dialogs; keyboard trap/Escape/focus restoration; synthetic storage-write failure and retry; dates across two distant time zones; multi-item selection with independent known/unknown policies, manual amount edits, original evidence bytes, queue cancellation and second-item failure/retry; date-only calendar download, visible-filter export and offline reload.
- Automated axe WCAG A/AA audit: desktop/mobile shelf and mobile proof detail, including text contrast, landmarks and accessible labels, plus the mobile multi-item picker.
- Page identity, meaningful rendering, no framework overlay, no app page errors, and no external requests in monitored end-to-end flow.
- Production TypeScript/Vite build; formatter check.

## Evidence artifacts

Screenshots: empty desktop, sample shelf desktop/mobile, proof detail desktop/mobile, mobile preparation checklist, timeline desktop, receipt product picker desktop/mobile and mobile verification queue. Browser-exported synthetic proof ZIP, printable HTML, date-only calendar and device backup ZIP accompany the handoff. See the sibling `deliverables/v2/` folder (original before-evidence remains in `deliverables/`) in the task workspace; source-only archives intentionally omit personal data and temporary test traces.

## Limits

Chromium was tested; Safari/Firefox, real iOS/Android and real calendar client imports were not. Automated accessibility checks do not replace a screen-reader usability review. Photos and scanned PDFs are retained without OCR; unusual PDF layouts may need manual correction. No real merchant eligibility, real personal receipts, external claim submission, legal entitlement, paid infrastructure, cloud sync or deployed-host behavior was tested. Device storage is unencrypted and can be evicted; use the exported backup. ZIP import is bounded and schema-checked; very large archives are deliberately refused.

The host GitHub CLI session was verified as authenticated. The first handoff PR was merged after its hosted CI passed. The follow-up adds multi-item verification, local calendar exports and post-merge CI. Final private-source commit, hosted outcomes and portable bundle identifiers are recorded in the handoff. No paid infrastructure or public deployment was created.
