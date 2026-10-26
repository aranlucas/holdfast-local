import type { Entry } from "@zip.js/zip.js";
import type { Attachment, Purchase } from "./model";
import {
  BACKUP_EVIDENCE_BYTES,
  BACKUP_METADATA_BYTES,
  BACKUP_PART_BYTES,
  backupArchiveReader,
  backupFile,
  orderedBackupFiles,
  readBackupFile,
  validateBackupVolumes,
  writeBackupArchive,
} from "./backup-archive";
import { backupHeader, backupRecords, purchaseMetadata } from "./backup-schema";
import type { BackupManifest, BackupRecord } from "./backup-schema";

function uniquePurchases(records: BackupRecord[]): void {
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Duplicate purchase IDs in backup.");
  }
}

function evidencePath(purchaseId: string, attachmentId: string): string {
  return `evidence/${purchaseId}/${attachmentId}`;
}

function metadataPath(index: number): string {
  return `metadata/${index}.json`;
}

function* backupEntries(purchases: Purchase[], manifest: BackupManifest, metadata: Blob) {
  yield { name: "holdfast.json", blob: new Blob([JSON.stringify(manifest)]) };

  for (let index = 0; index < manifest.metadataChunks; index++) {
    const start = index * BACKUP_METADATA_BYTES;
    yield {
      name: metadataPath(index),
      blob: metadata.slice(start, start + BACKUP_METADATA_BYTES),
    };
  }

  for (const purchase of purchases) {
    for (const attachment of purchase.attachments) {
      if (attachment.blob.size !== attachment.size) {
        throw new Error(`Original evidence size does not match: ${attachment.name}`);
      }

      yield { name: evidencePath(purchase.id, attachment.id), blob: attachment.blob };
    }
  }
}

/** Create every part of a version-2 backup before offering any part for download. */
export function exportBackup(purchases: Purchase[]) {
  const records = backupRecords.parse(purchases.map(purchaseMetadata));
  uniquePurchases(records);
  const metadata = new Blob([JSON.stringify(records)]);

  const manifest: BackupManifest = {
    schemaVersion: 2,
    backupId: crypto.randomUUID(),
    metadataChunks: Math.ceil(metadata.size / BACKUP_METADATA_BYTES),
    metadataBytes: metadata.size,
    purchaseCount: records.length,
  };

  return writeBackupArchive(manifest.backupId, backupEntries(purchases, manifest, metadata));
}

async function readMetadata(entries: Map<string, Entry>, manifest: BackupManifest) {
  if (manifest.metadataChunks > entries.size) {
    throw new Error("Backup metadata is incomplete.");
  }

  const chunks: Blob[] = [];

  for (let index = 0; index < manifest.metadataChunks; index++) {
    chunks.push(
      // oxlint-disable-next-line eslint/no-await-in-loop -- Bound each native ZIP extraction before starting the next.
      await readBackupFile(backupFile(entries, metadataPath(index)), BACKUP_METADATA_BYTES),
    );
  }

  const metadata = new Blob(chunks);

  if (metadata.size !== manifest.metadataBytes) {
    throw new Error("Backup metadata size does not match.");
  }

  const records = backupRecords.parse(JSON.parse(await metadata.text()));

  if (records.length !== manifest.purchaseCount) {
    throw new Error("Backup purchase count does not match.");
  }

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
  metadataChunks: number,
) {
  const expected = new Set(["holdfast.json"]);

  for (let index = 0; index < metadataChunks; index++) {
    expected.add(metadataPath(index));
  }

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
    BACKUP_METADATA_BYTES,
  );

  const manifest = backupHeader.parse(JSON.parse(await manifestFile.text()));
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
  validateEntries(files, records, manifest.metadataChunks);

  return records;
}

/** Validate the entire selected backup. No database writes happen in this module. */
export async function importBackup(selected: File[]): Promise<Purchase[]> {
  const { files, backupId } = orderedBackupFiles(selected);
  const reader = backupArchiveReader(files);

  try {
    return await readPurchases(await reader.getEntries(), files.length, backupId);
  } finally {
    await reader.close();
  }
}
