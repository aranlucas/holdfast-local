import {
  BlobReader,
  BlobWriter,
  SplitDataWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js/lib/zip-core-native.js";
import type { Entry, FileEntry } from "@zip.js/zip.js/lib/zip-core-native.js";

export const BACKUP_PART_BYTES = 60 * 1024 * 1024;

export const BACKUP_PAYLOAD_BYTES = 48 * 1024 * 1024;

export const BACKUP_PART_ENTRIES = 4096;

export const BACKUP_METADATA_BYTES = 1024 * 1024;

export const BACKUP_DESCRIPTOR_BYTES = 4096;

export const LEGACY_METADATA_BYTES = 5 * 1024 * 1024;

export const BACKUP_EVIDENCE_BYTES = 12 * 1024 * 1024;

export type BackupPart = { name: string; blob: Blob };

export type BackupOptions = { signal?: AbortSignal };

type BackupEntry = { name: string; blob: Blob };

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
  entries: Iterable<BackupEntry>,
  options: BackupOptions,
): Promise<Blob[]> {
  const disks: BlobWriter[] = [];
  const split = new SplitDataWriter(diskWriters(disks), BACKUP_PART_BYTES);
  const writer = new ZipWriter(split, { useWebWorkers: false, level: 6 });
  let bytes = 0;
  let count = 0;

  try {
    for (const entry of entries) {
      options.signal?.throwIfAborted();

      if (bytes + entry.blob.size > BACKUP_PAYLOAD_BYTES || count === BACKUP_PART_ENTRIES) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Finish this volume before starting the next entry.
        await split.closeDisk();
        bytes = 0;
        count = 0;
      }

      // oxlint-disable-next-line eslint/no-await-in-loop -- Native ZIP writes share an ordered archive and volume budget.
      await writer.add(entry.name, new BlobReader(entry.blob), options);
      bytes += entry.blob.size;
      count++;
    }
  } catch (error) {
    try {
      await writer.close();
    } catch (closeError) {
      // oxlint-disable-next-line eslint/preserve-caught-error -- Preserve both failures while retaining the original write error as the cause.
      throw new AggregateError([error, closeError], "Backup creation failed.", { cause: error });
    }

    throw error;
  }

  await writer.close();
  options.signal?.throwIfAborted();

  return Promise.all(disks.map((disk) => disk.getData()));
}

export function backupArchiveReader(files: File[], options: BackupOptions) {
  return new ZipReader(
    files.map((file) => new BlobReader(file)),
    {
      ...options,
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

    if (!total || entry.directory || entry.encrypted || entry.symlink) {
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

  if (!entry || entry.directory || entry.encrypted || entry.symlink) {
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
