# Holdfast feature roadmap

Updated 2026-10-26. Proposed product work, in priority order; this document does
not mean a feature is implemented. Digits and MCP products take portfolio
priority. Adoption and willingness to pay have not been measured.

## Starting point

Baseline: `c0554da2390a83a944b15c4389046977f5da2208`, as described in the
[README](README.md) and [architecture](docs/ARCHITECTURE.md). Holdfast already
imports receipts locally, supports multiple items, records user-verified return
and warranty dates, exports proof packets and calendars, and restores portable
backup sets atomically. A backup export is already shipped; another ZIP format
is not the next customer outcome.

Target user: someone trying to return or claim coverage for a household purchase
without finding the receipt, policy and supporting documents again.

## Priorities

### 1. A return-ready action queue

Turn recorded dates into a short list of purchases needing a decision, missing
evidence or a next action. Let the user defer, prepare a return or keep an item.

Acceptance: every displayed deadline explains its recorded source; unknown dates
remain unknown; changing a purchase immediately updates the queue; preparing an
item opens its existing proof checklist and export. No merchant eligibility or
refund entitlement is inferred.

### 2. Follow a return through the refund

Extend the current returned/kept outcome with optional shipment, received and
refund records, partial amounts, and a user-entered follow-up date.

Acceptance: partial refunds retain the outstanding amount, corrections are
possible, original evidence survives, and the packet includes the selected
history. Tracking numbers are records, not claims of live carrier tracking.

### 3. Faster photo receipt entry

Offer an optional local OCR-assisted draft for photos and scanned receipts,
subject to a small device/performance evaluation. The current manual path stays
available.

Acceptance: extracted fields show their source region and require verification;
ambiguous dates and totals are not silently promoted; cancellation and offline
use work; receipt contents never leave the device for OCR. Pick a maintained
implementation only after testing representative, consented or synthetic inputs.

### 4. A guided move to another device

Build a transfer checklist around the existing complete backup sets, with a
clear receipt showing record counts, missing volumes and successful restore.

Acceptance: an interrupted or invalid transfer leaves the destination intact;
the user can verify restored attachments before deleting anything on the source.
Do not promise cloud sync or recovery of every historical oversized v1 export.

## First release and evidence

Ship priority 1 alone first. Observe five volunteers preparing a return from
their own locally held records, with no receipt contents collected. Record time
to find the proof, missing information, incorrect dates and whether the same
person uses the cabinet for a second purchase. Compare with their current method
before setting an improvement target. Refund value is user-reported, not revenue
caused by the app.

Use existing Vitest and Playwright suites for queue/date transitions and the
complete prepare/export flow. Keep the local-only privacy model. Notifications,
merchant submissions and accounts require separate product decisions.
