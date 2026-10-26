import type { Entry } from "@zip.js/zip.js";
import type { Attachment, Purchase } from "./model";
import {
  BACKUP_DESCRIPTOR_BYTES,
  BACKUP_EVIDENCE_BYTES,
  BACKUP_METADATA_BYTES,
  BACKUP_PART_BYTES,
  LEGACY_METADATA_BYTES,
  backupArchiveReader,
  backupFile,
  readBackupFile,
  validateBackupVolumes,
  writeBackupArchive,
} from "./backup-archive";
import { backupHeader, backupRecord, recordManifest, purchaseMetadata } from "./backup-schema";
import type { BackupManifest, BackupRecord } from "./backup-schema";
import type { BackupOptions } from "./backup-archive";
import { createBackupSet, orderedBackupFiles } from "./backup-set";

type PurchaseIdentity = Pick<Purchase, "id">;

function uniquePurchases(records: PurchaseIdentity[]): void {
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Duplicate purchase IDs in backup.");
  }
}

function evidencePath(purchaseId: string, attachmentId: string): string {
  return `evidence/${purchaseId}/${attachmentId}`;
}

function recordPath(index: number): string {
  return `purchases/${index}/record.json`;
}

function metadataPath(record: number, chunk: number): string {
  return `purchases/${record}/metadata-${chunk}.json`;
}

function* recordEntries(purchase: Purchase, index: number) {
  const record = backupRecord.parse(purchaseMetadata(purchase));
  const metadata = new Blob([JSON.stringify(record)]);

  const descriptor = {
    id: record.id,
    metadataBytes: metadata.size,
    metadataChunks: Math.ceil(metadata.size / BACKUP_METADATA_BYTES),
  };

  yield { name: recordPath(index), blob: new Blob([JSON.stringify(descriptor)]) };

  for (let chunk = 0; chunk < descriptor.metadataChunks; chunk++) {
    const start = chunk * BACKUP_METADATA_BYTES;
    yield {
      name: metadataPath(index, chunk),
      blob: metadata.slice(start, start + BACKUP_METADATA_BYTES),
    };
  }

  for (const attachment of purchase.attachments) {
    if (attachment.blob.size !== attachment.size) {
      throw new Error(`Original evidence size does not match: ${attachment.name}`);
    }

    yield { name: evidencePath(purchase.id, attachment.id), blob: attachment.blob };
  }
}

function* backupEntries(purchases: Purchase[], manifest: BackupManifest) {
  yield { name: "holdfast.json", blob: new Blob([JSON.stringify(manifest)]) };

  for (const [index, purchase] of purchases.entries()) {
    yield* recordEntries(purchase, index);
  }
}

/** Create every part of a version-2 backup before offering any part for download. */
export async function exportBackup(purchases: Purchase[], options: BackupOptions = {}) {
  uniquePurchases(purchases);

  const manifest: BackupManifest = {
    schemaVersion: 2,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    purchaseCount: purchases.length,
  };

  const volumes = await writeBackupArchive(backupEntries(purchases, manifest), options);

  return createBackupSet(manifest.backupId, volumes, options);
}

async function readRecord(entries: Map<string, Entry>, index: number, expected: Set<string>) {
  const descriptorPath = recordPath(index);
  expected.add(descriptorPath);

  const descriptor = await readBackupFile(
    backupFile(entries, descriptorPath),
    BACKUP_DESCRIPTOR_BYTES,
  );

  const manifest = recordManifest.parse(JSON.parse(await descriptor.text()));

  if (manifest.metadataChunks > entries.size) {
    throw new Error("Backup metadata is incomplete.");
  }

  const chunks: Blob[] = [];

  for (let chunk = 0; chunk < manifest.metadataChunks; chunk++) {
    const path = metadataPath(index, chunk);
    expected.add(path);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Bound each metadata extraction before starting the next.
    const data = await readBackupFile(backupFile(entries, path), BACKUP_METADATA_BYTES);
    chunks.push(data);
  }

  const metadata = new Blob(chunks);

  if (metadata.size !== manifest.metadataBytes) {
    throw new Error("Backup metadata size does not match.");
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(await metadata.arrayBuffer());
  const record = backupRecord.parse(JSON.parse(text));

  if (record.id !== manifest.id) {
    throw new Error("Backup purchase identity does not match.");
  }

  return record;
}

async function readMetadata(entries: Map<string, Entry>, manifest: BackupManifest) {
  if (manifest.purchaseCount > entries.size) {
    throw new Error("Backup metadata is incomplete.");
  }

  const records: BackupRecord[] = [];
  const expected = new Set(["holdfast.json"]);

  for (let index = 0; index < manifest.purchaseCount; index++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Reconstruct one record at a time instead of one cabinet-sized JSON string.
    records.push(await readRecord(entries, index, expected));
  }

  validateEntries(entries, records, expected);

  return records;
}

function validateEvidence(entries: Map<string, Entry>, records: BackupRecord[], legacy: boolean) {
  let total = 0;

  for (const purchase of records) {
    for (const attachment of purchase.attachments) {
      const entry = entries.get(evidencePath(purchase.id, attachment.id));

      if (!entry) {
        throw new Error(`Missing evidence: ${attachment.name}`);
      }

      if (entry.uncompressedSize !== attachment.size) {
        throw new Error("Backup evidence size is invalid.");
      }

      total += attachment.size;
    }
  }

  if (legacy && total > BACKUP_PART_BYTES) {
    throw new Error("Legacy backup evidence is larger than 60 MB.");
  }
}

function validateEntries(
  entries: Map<string, Entry>,
  records: BackupRecord[],
  expected: Set<string>,
) {
  for (const purchase of records) {
    for (const attachment of purchase.attachments) {
      expected.add(evidencePath(purchase.id, attachment.id));
    }
  }

  if ([...entries.keys()].some((name) => !expected.has(name))) {
    throw new Error("Backup contains unexpected entries.");
  }
}

async function restorePurchase(
  entries: Map<string, Entry>,
  purchase: BackupRecord,
): Promise<Purchase> {
  const attachments: Attachment[] = [];

  for (const attachment of purchase.attachments) {
    const entry = backupFile(entries, evidencePath(purchase.id, attachment.id));
    // oxlint-disable-next-line eslint/no-await-in-loop -- Keep evidence extraction sequential and fail before starting another document.
    const blob = await readBackupFile(entry, BACKUP_EVIDENCE_BYTES, attachment.type);
    attachments.push({ ...attachment, blob });
  }

  return { ...purchase, attachments };
}

async function readPurchases(entries: Entry[], partCount: number, backupId?: string) {
  const files = new Map(entries.map((entry) => [entry.filename, entry]));

  if (!files.has("holdfast.json")) {
    throw new Error("This is not a Holdfast backup ZIP.");
  }

  const manifestFile = await readBackupFile(
    backupFile(files, "holdfast.json"),
    LEGACY_METADATA_BYTES,
  );

  const manifest = backupHeader.parse(JSON.parse(await manifestFile.text()));

  if (manifest.schemaVersion === 2 && manifestFile.size > BACKUP_DESCRIPTOR_BYTES) {
    throw new Error("Backup descriptor is too large.");
  }

  const records = await recordsFromManifest(files, entries, manifest, partCount, backupId);
  uniquePurchases(records);
  validateEvidence(files, records, manifest.schemaVersion === 1);
  const result: Purchase[] = [];

  for (const purchase of records) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Restore into memory in order; the caller saves only after every document validates.
    result.push(await restorePurchase(files, purchase));
  }

  return result;
}

async function recordsFromManifest(
  files: Map<string, Entry>,
  entries: Entry[],
  manifest: ReturnType<typeof backupHeader.parse>,
  partCount: number,
  backupId?: string,
) {
  if (manifest.schemaVersion === 1) {
    if (partCount !== 1) {
      throw new Error("A legacy backup must be a single ZIP file.");
    }

    return manifest.purchases;
  }

  if (backupId && manifest.backupId !== backupId) {
    throw new Error("Backup parts do not match their manifest.");
  }

  validateBackupVolumes(entries, partCount);
  const records = await readMetadata(files, manifest);

  return records;
}

/** Validate the entire selected backup. No database writes happen in this module. */
export async function importBackup(
  selected: File[],
  options: BackupOptions = {},
): Promise<Purchase[]> {
  const { files, backupId } = await orderedBackupFiles(selected, options);
  const reader = backupArchiveReader(files, options);

  try {
    return await readPurchases(await reader.getEntries(), files.length, backupId);
  } finally {
    await reader.close();
  }
}
