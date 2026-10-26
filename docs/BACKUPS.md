# Portable cabinet backups

My device creates every required file before offering a backup. A small backup is
one ZIP. A large backup is a native split ZIP: `.z01`, `.z02`, and subsequent
volumes, a final `.zip`, and a required `.holdfast.json` index. Download all listed
files, retain their filenames, and select the whole set when restoring. Volumes
belong to one archive; each volume is not an independent ZIP. The application
never silently truncates records, original filenames, text or documents to fit.

Restoring first validates and reconstructs the entire set in memory. Only then
does `App` call the existing atomic `saveMany`. Matching purchase IDs update;
unrelated records remain. A missing, mixed, duplicated, damaged or unsupported
file rejects the operation before storage writes begin. A storage failure rolls
back the batch. A failure reloading the cabinet after a committed save is a
different boundary and remains an application-level follow-up.

## Module and API contracts

| Module / API                                                   | Contract                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup.ts`: `exportBackup(purchases, { signal }?)`            | Returns `Promise<BackupPart[]>`, each `{ name, blob }`. Generates the complete set before publishing it. Invalid metadata, mismatched original sizes, I/O failure or cancellation rejects; no generated prefix is returned.       |
| `backup.ts`: `importBackup(files, { signal }?)`                | Returns all reconstructed `Purchase[]` after validation. Accepts one v1/v2 ZIP or the indexed multipart set. File-picker order is irrelevant. Never writes the database.                                                          |
| `backup-schema.ts`: `purchaseMetadata`, `validateBackupRecord` | Strip attachment Blobs for JSON and validate the record with Zod plus domain checks. Preserve JSON extension fields and original names/types. Enforce unique attachment IDs, ten documents per purchase and 12 MiB per document.  |
| `backup-archive.ts`                                            | Own native ZIP reader/writer lifetime, physical volume limits, payload budgets and bounded entry reads. Readers close in `finally`; failed writers close and discard their results, retaining both errors if cleanup also fails.  |
| `backup-set.ts`                                                | Name native volumes, create the external index, verify exact membership/size/hash, and order files for `ZipReader`. Uses native Web Crypto, one volume at a time.                                                                 |
| `Privacy`                                                      | Own the AbortController, retry state, selected input and download buttons. Cancellation/unmount prevents a later validation result from starting a save. A canceled older operation cannot clear a newer operation's state/input. |

Cancellation is checked after asynchronous module loading, hashing and extraction,
and before the storage callback. Native ZIP operations receive the signal. A
current Blob read or Web Crypto digest can finish before cancellation is observed.
Once atomic persistence starts, the cancel control is disabled; leaving the view
does not undo an already-started database transaction. Download controls initiate
browser downloads; the application cannot attest that the user saved a file.

## Version 2 layout

The logical ZIP contains:

```text
holdfast.json
purchases/0/record.json
purchases/0/metadata-0.json
purchases/0/metadata-1.json
...
evidence/<purchase-id>/<attachment-id>
```

`holdfast.json` identifies schema version 2, the random backup ID, export time and
purchase count. Each ordinal `record.json` identifies the purchase, encoded JSON
byte length and chunk count. Metadata is serialized one purchase at a time and
sliced into 1 MiB byte entries. Restore joins that record's bytes and uses fatal
UTF-8 decoding before JSON/Zod validation; a split multibyte character is retained.
Evidence uses short canonical ID paths, independently of user filenames.

The multipart index uses `format: "holdfast-volume-set"`, `version: 1`, the backup
ID, and ordered `{ name, bytes, sha256 }` volume descriptors. Keeping it outside
the ZIP avoids hashes containing themselves. Exact selection, canonical names,
sizes and SHA-256 are checked before ZIP extraction; the internal backup ID must
also match. The index byte budget scales as `4096 + 256 × selected volume count`,
and Zod validates fixed keys, numbers and hashes. Hashes detect accidental mixing
and damage; they do not authenticate an index replaced by an adversary.

| Boundary                                  | Limit / behavior                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Physical volume                           | 60 MiB; native `SplitDataWriter` owns byte splitting and ZIP overhead.                                                                                                   |
| Referenced v2 payload per starting volume | 48 MiB and 4,096 entries; the writer starts another native disk before either budget is exceeded. The reader checks all volume totals before extracting record metadata. |
| Root / per-record descriptor              | 4 KiB. Initial root read permits the legacy 5 MiB ceiling until the version is known, then applies the v2 limit.                                                         |
| Metadata entry                            | 1 MiB; total record metadata can span several entries and volumes.                                                                                                       |
| Evidence entry                            | 12 MiB; exact original size, native streamed output-size checks and CRC validation.                                                                                      |
| Legacy v1                                 | One ZIP, at most 60 MiB compressed, 5 MiB JSON and 60 MiB referenced evidence. No separate 500-record limit.                                                             |

There is no v2 cabinet-wide 500-record, 5 MiB metadata or 60 MiB evidence ceiling.
The complete cabinet, staged restored Blobs, ZIP directory, generated volumes and
largest serialized record still consume memory. Per-entry accepted-byte checks
are not a total-memory or inflater-allocation guarantee. Very large cabinets
remain constrained by browser/device resources. Failed exports leave the source
cabinet unchanged.

The legacy byte limits deliberately remain. Previously restorable v1 backups,
and some historical exports blocked only by the record/name limits, now restore.
An old v1 export exceeding its retained byte budgets still needs a separate
recovery design; new v2 backups do not retroactively change its format.

## Native tooling and regression coverage

Pinned [zip.js 2.24.0](https://github.com/gildas-lormeau/zip.js/releases/tag/v2.24.0)
owns split ZIPs, seekable Blob reads, ZIP64, streaming decompression, CRC and overlap
checks. Its [native core build](https://github.com/gildas-lormeau/zip.js/blob/v2.24.0/lib/zip-core-native.js)
avoids a WASM/worker deployment path in this integration. Web workers are disabled;
offline/browser behavior is tested. JSZip stays responsible for proof packets.
Its [documented lack of multivolume support](https://stuk.github.io/jszip/documentation/limitations.html)
and pause behavior do not meet this backup boundary. No archive parser, splitter,
compressor, checksum implementation, validation script or test runner was added.

Normal Vitest tests cover 501-record cabinets, metadata beyond 5 MiB, UTF-8 chunk
boundaries, one purchase with 120 MiB of originals, genuine v1 archives, exact
attachment bytes, complete-set membership, checksum failures, forged sizes,
CRC corruption, export failure, cancellation and retry. Native output-size tests
assert that a forged entry cannot deliver bytes beyond its advertised budget to
the consumer; metadata caps bound that advertised budget before product reads.

Playwright exercises offline multipart downloads and restore, unchanged durable
data after an incomplete selection, cancellation followed by a newer restore,
unmount cancellation, and the existing real-IndexedDB rollback regressions.
Chromium is the exercised browser; Safari/Firefox and peak-memory profiling remain
unverified. Run the normal project commands:

```sh
pnpm test
pnpm lint
pnpm check:format
pnpm build
pnpm test:e2e
```

The declarative Oxlint classic-complexity maximum is 9 for backup modules, device
controls and their regression tests. This bounds local function complexity; the
new validation/cancellation paths add behavior and do not imply a reduction in
the whole application's decision count.
