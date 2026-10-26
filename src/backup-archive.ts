import { BlobReader, BlobWriter, SplitDataWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import type { Entry, FileEntry } from "@zip.js/zip.js";

export const BACKUP_PART_BYTES = 60 * 1024 * 1024;

export const BACKUP_PAYLOAD_BYTES = 48 * 1024 * 1024;

export const BACKUP_PART_ENTRIES = 500;

export const BACKUP_METADATA_BYTES = 5 * 1024 * 1024;

export const BACKUP_EVIDENCE_BYTES = 12 * 1024 * 1024;

export type BackupPart = { name: string; blob: Blob };

type BackupEntry = { name: string; blob: Blob };

type BackupSelection = { files: File[]; backupId?: string };

// oxlint-disable-next-line typescript/require-await -- The native SplitDataWriter requires an async generator of disk writers.
async function* diskWriters(disks: BlobWriter[]): AsyncGenerator<BlobWriter, boolean> {
  while (true) {
    const disk = new BlobWriter("application/zip");
    disks.push(disk);
    yield disk;
  }
}

/** Native split ZIP volumes; cap both compressed bytes and declared payload per volume. */
export async function writeBackupArchive(
  backupId: string,
  entries: Iterable<BackupEntry>,
): Promise<BackupPart[]> {
  const disks: BlobWriter[] = [];
  const split = new SplitDataWriter(diskWriters(disks), BACKUP_PART_BYTES);
  const writer = new ZipWriter(split, { useWebWorkers: false, level: 6 });
  let bytes = 0;
  let count = 0;

  for (const entry of entries) {
    if (bytes + entry.blob.size > BACKUP_PAYLOAD_BYTES || count === BACKUP_PART_ENTRIES) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Finish the previous volume before adding the next entry.
      await split.closeDisk();
      bytes = 0;
      count = 0;
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- Native ZIP writes share one ordered archive and volume budget.
    await writer.add(entry.name, new BlobReader(entry.blob));
    bytes += entry.blob.size;
    count++;
  }

  await writer.close();
  const blobs = await Promise.all(disks.map((disk) => disk.getData()));

  return blobs.map((blob, index) => ({
    name: `Holdfast-${backupId}-part-${index + 1}-of-${blobs.length}.zip`,
    blob,
  }));
}

const partName = /^Holdfast-([a-f\d-]{36})-part-(\d+)-of-(\d+)\.zip$/;

/** Selection order is irrelevant; filenames identify the complete native volume set. */
export function orderedBackupFiles(files: File[]): BackupSelection {
  if (!files.length) {
    throw new Error("Choose a Holdfast backup, including every part of a multipart backup.");
  }

  if (files.some((file) => file.size > BACKUP_PART_BYTES)) {
    throw new Error("A backup file is larger than 60 MB.");
  }

  if (files.length === 1) {
    return { files };
  }

  const parts = files.map((file) => {
    const match = partName.exec(file.name);

    if (!match || Number(match[3]) !== files.length) {
      throw new Error("Select every backup part with its original filename.");
    }

    return { file, backupId: match[1], index: Number(match[2]) };
  });

  parts.sort((a, b) => a.index - b.index);
  const backupId = parts[0].backupId;

  if (parts.some((part, index) => part.backupId !== backupId || part.index !== index + 1)) {
    throw new Error("Backup parts are missing, duplicated, or from different backups.");
  }

  return { files: parts.map((part) => part.file), backupId };
}

export function backupArchiveReader(files: File[]) {
  return new ZipReader(
    files.map((file) => new BlobReader(file)),
    {
      useWebWorkers: false,
      strictness: "strict",
      checkCrc32: true,
      checkOverlappingEntry: true,
    },
  );
}

/** Check all advertised sizes before extraction. zip.js also bounds actual output and verifies CRC. */
export function validateBackupVolumes(entries: Entry[], partCount: number): void {
  const totals = Array.from({ length: partCount }, () => ({ bytes: 0, entries: 0 }));

  for (const entry of entries) {
    const total = totals[entry.diskNumberStart];

    if (!total || entry.directory || entry.encrypted) {
      throw new Error("Backup contains an unsupported entry.");
    }

    total.bytes += entry.uncompressedSize;
    total.entries++;

    if (total.bytes > BACKUP_PAYLOAD_BYTES || total.entries > BACKUP_PART_ENTRIES) {
      throw new Error("Backup part contains too much data.");
    }
  }
}

export function backupFile(entries: Map<string, Entry>, name: string): FileEntry {
  const entry = entries.get(name);

  if (!entry || entry.directory || entry.encrypted) {
    throw new Error(`Missing or unsupported backup entry: ${name}`);
  }

  return entry;
}

export function readBackupFile(entry: FileEntry, maximum: number, type = ""): Promise<Blob> {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > maximum) {
    throw new Error("Backup entry is too large.");
  }

  return entry.getData(new BlobWriter(type));
}
