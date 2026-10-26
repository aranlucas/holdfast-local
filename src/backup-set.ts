import { z } from "zod";
import { BACKUP_PART_BYTES } from "./backup-archive";
import type { BackupOptions, BackupPart } from "./backup-archive";

const volumeIndex = z.strictObject({
  format: z.literal("holdfast-volume-set"),
  version: z.literal(1),
  backupId: z.uuid(),
  volumes: z
    .array(
      z.strictObject({
        name: z.string().max(80),
        bytes: z.number().int().positive().max(BACKUP_PART_BYTES),
        sha256: z.string().regex(/^[a-f\d]{64}$/),
      }),
    )
    .min(2),
});

type VolumeIndex = z.infer<typeof volumeIndex>;

type BackupSelection = { files: File[]; backupId?: string };

function volumeName(id: string, index: number, count: number): string {
  const extension = index === count - 1 ? "zip" : `z${String(index + 1).padStart(2, "0")}`;

  return `Holdfast-${id}.${extension}`;
}

async function hashVolume(blob: Blob, options: BackupOptions): Promise<string> {
  options.signal?.throwIfAborted();
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  options.signal?.throwIfAborted();

  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** An external index binds all volumes without introducing hashes that contain themselves. */
export async function createBackupSet(
  id: string,
  blobs: Blob[],
  options: BackupOptions,
): Promise<BackupPart[]> {
  const parts = blobs.map((blob, index) => ({ name: volumeName(id, index, blobs.length), blob }));

  if (parts.length === 1) {
    return parts;
  }

  const volumes: VolumeIndex["volumes"] = [];

  for (const part of parts) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Hold at most one volume's hash input in memory.
    const sha256 = await hashVolume(part.blob, options);
    volumes.push({ name: part.name, bytes: part.blob.size, sha256 });
  }

  const index: VolumeIndex = { format: "holdfast-volume-set", version: 1, backupId: id, volumes };
  parts.push({
    name: `Holdfast-${id}.holdfast.json`,
    blob: new Blob([JSON.stringify(index)], { type: "application/json" }),
  });

  return parts;
}

async function readIndex(file: File, selected: number): Promise<VolumeIndex> {
  if (file.size > 4096 + 256 * (selected - 1)) {
    throw new Error("Backup index is too large for the selected files.");
  }

  const index = volumeIndex.parse(JSON.parse(await file.text()));

  if (index.volumes.length !== selected - 1) {
    throw new Error("Select the backup index and every volume from the same backup.");
  }

  return index;
}

async function verifyVolumes(files: File[], index: VolumeIndex, options: BackupOptions) {
  const byName = new Map(files.map((file) => [file.name, file]));

  if (byName.size !== files.length) {
    throw new Error("Duplicate backup filenames.");
  }

  const ordered: File[] = [];

  for (const [position, volume] of index.volumes.entries()) {
    if (volume.name !== volumeName(index.backupId, position, index.volumes.length)) {
      throw new Error("Backup volume names do not match their index.");
    }

    const file = byName.get(volume.name);

    if (!file || file.size !== volume.bytes) {
      throw new Error("Backup volumes are missing, changed, or from another backup.");
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- Validate one bounded volume at a time before archive extraction.
    const hash = await hashVolume(file, options);

    if (hash !== volume.sha256) {
      throw new Error("Backup volume checksum does not match.");
    }

    ordered.push(file);
  }

  return ordered;
}

/** Validate membership and bytes before parsing the logical ZIP, irrespective of picker order. */
export async function orderedBackupFiles(
  files: File[],
  options: BackupOptions,
): Promise<BackupSelection> {
  options.signal?.throwIfAborted();

  if (
    !files.length ||
    files.some((file) => !file.name.endsWith(".holdfast.json") && file.size > BACKUP_PART_BYTES)
  ) {
    throw new Error("Choose every backup file; each volume must be at most 60 MB.");
  }

  const indexes = files.filter((file) => file.name.endsWith(".holdfast.json"));

  if (files.length === 1 && !indexes.length) {
    return { files };
  }

  if (indexes.length !== 1) {
    throw new Error("Select exactly one backup index and all of its volumes.");
  }

  const index = await readIndex(indexes[0], files.length);
  const volumes = files.filter((file) => file !== indexes[0]);

  return { files: await verifyVolumes(volumes, index, options), backupId: index.backupId };
}
