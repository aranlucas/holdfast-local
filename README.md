# Holdfast

**Keep the proof. Lose the paper pile.** A private, local-first receipt cabinet that turns a receipt into a transparent return/warranty timeline and a ready-to-export proof packet.

## Run

Use the Node.js version in `.node-version` and the pnpm version pinned in `package.json`. No account, credentials, AI service, database server, or environment secrets.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

Open **http://127.0.0.1:4319**. The production build works offline after its first successful load. Keep the same browser and address/port to use the same cabinet. For development: `pnpm run dev` at **https://holdfast.localhost** (offline caching is disabled in development). `pnpm run dev` runs through [Portless](https://github.com/vercel-labs/portless) (a dev dependency); its first run may ask for `sudo` to bind port 443 and trust a local certificate.

To run a portable build without installing dependencies, copy `dist/` and `server.mjs` together and run `node server.mjs` from that directory.

## Try it in one minute

1. Click **Try a sample shelf** for four explicitly fictional purchases, or **Add receipt → Try a receipt with two items** to try a receipt basket.
2. Select the receipt products you want to track. Verify the purchase, calendar date, and item-specific policy for each. Inspect **Source evidence** for the matched receipt line and qualitative confidence.
3. Open a purchase, prepare its checklist, and **Export proof packet**. The ZIP contains an offline printable HTML summary, original files, receipt text, policy text, structured data, and a Markdown checklist.
4. **My device** exports/restores a complete backup. Large backups contain numbered ZIP volumes and a required index; download every file and select them together to restore. **Timeline** shows recorded dates and unknowns, and exports the visible dates as a one-time `.ics` calendar file. Each purchase can also export its own dates.

## Input and rules

- Paste text or drop TXT/Markdown, text-layer PDFs, PNG, JPEG, or WebP. PDFs are processed locally; photos/scanned PDFs keep the original document and require manual fact entry. Limits: 12 MiB per document, 20 PDF pages, 100,000 receipt-text characters, 10 attachments per purchase.
- Receipt extraction is deterministic and conservative. Labeled facts get strong matches, likely facts get suggestions, ambiguous numeric dates remain empty. Confidence is qualitative, not a calibrated probability. Verify all facts. Multiple labeled/likely priced lines open a product picker. Selected products become independent verification drafts, with source line evidence and the complete original document. Receipt totals are never copied to each product; missing line amounts stay empty and shared taxes/shipping/discounts are not allocated. Up to 20 items can be tracked in one pass (first 100 suggested lines shown). Cancelling discards remaining drafts while keeping already saved items.
- Each record has an independent policy: unknown, explicit calendar-day return window, exact end date, or no stated window; warranty term in calendar months, exact end date, unknown, or none stated. No universal merchant rule or legal entitlement is inferred.
- Choose purchase/delivery start and whether the start date is day 0 or day 1. Warranty month-end addition clamps to the last day. Dates use UTC calendar arithmetic and display without shifting across time zones; “today” follows the browser’s zone.
- Return dates mean **the user’s recorded planning date**. Check product/seller eligibility, condition, fees, final-day cutoff, holidays, shipping/receipt requirements, and coverage yourself. Exact dates can override calculated terms.
- Returned/kept outcomes are reversible and preserve the proof. “Clear this device” is permanent without a backup and requires an explicit in-app confirmation.

## Privacy

Records and original Blobs live only in this browser origin’s IndexedDB. There is no inbox access, analytics, external AI/OCR, cloud synchronization, background upload, or merchant submission. The production app precaches its own assets and PDF worker locally. Static assets are the only network requests.

Calendar files contain only the item, merchant, policy source and recorded-date explanation. They omit receipt text, order/serial numbers, condition notes and documents. Dates are all-day events, with no embedded alerts or subscriptions. Your calendar app may add its own default alerts; imports do not update automatically after edits. Unknown/no-window rules are omitted.

Local storage is **not an encrypted vault**. Anyone using this browser profile can access it. Private browsing, browser-data clearing, storage eviction, or a different origin can remove/separate data. Export backups. Downloaded packets/backups contain the receipt data and documents you added; share them intentionally.

## Verification

```sh
pnpm test
pnpm run build
pnpm exec playwright install chromium
pnpm run test:e2e
pnpm run lint
pnpm run check:format
```

Unit tests use a separate Vitest configuration so receipt/date/export logic can run without initializing the production service-worker plugin. The production build and browser tests still use `vite.config.ts` and require its PWA dependencies.

Hosted CI runs lint, formatting, unit tests, the production build, and the browser suite on non-draft pull requests and main-branch pushes. It does not deploy.

Browser tests use one worker and start and stop their own local production server on port 4319. An occupied port fails explicitly so an unrelated checkout cannot supply the tested build. To reuse an already installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Screenshots and sample exports default to `/tmp/holdfast-qa`; override with `HOLDFAST_EVIDENCE_DIR`. Tests use only synthetic data.

Coverage is limited to Chromium and monitored application flows; the request checks do not cover every network channel. Safari/Firefox, real iOS/Android and real calendar-client imports remain unverified. Automated accessibility checks do not replace a screen-reader usability review. Real merchant eligibility, personal receipts, external claim submission and deployed-host behavior are not tested.

## Deployment compatibility

- **Railway**: `Dockerfile` and `railway.json`; static Node server honors `PORT`, binds `HOST=0.0.0.0` in Docker, and offers `/health`. The image needs no runtime npm dependencies. Configure access controls before a user-approved release.
- **Cloudflare**: build and use `dist/` as static assets; `wrangler.jsonc` is a compatible Workers static-assets configuration. `_headers` provides the same security headers for Cloudflare Pages. Provisioning/deployment remains a separate user-approved action.

See [architecture contracts](docs/ARCHITECTURE.md), [backup recovery and format](docs/BACKUPS.md), [design decisions](docs/DECISIONS.md), and the proposed [feature roadmap](ROADMAP.md).

Reliability CI also runs a credential-free cabinet round trip with the pinned
[tester-army/e2e](https://github.com/tester-army/e2e) web engine (`pnpm run test:journeys`).
It verifies edited values after reload and after backup, clear and restore;
Playwright retains the deeper offline, original-byte and injected-failure coverage.
See [the behavior audit](docs/reliability-audit.md) for findings and CI evidence.
