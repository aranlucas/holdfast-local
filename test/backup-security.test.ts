import { expect, it } from "vitest";
import JSZip from "jszip";
import { BlobReader, ZipReader } from "@zip.js/zip.js/lib/zip-core-native.js";
import { exportBackup, importBackup } from "@/backup";
import { blankPurchase } from "@/model";
import { purchaseMetadata } from "@/backup-schema";
import type { Purchase } from "@/model";

function purchase(): Purchase {
  return {
    ...blankPurchase(),
    merchant: "Synthetic shop",
    item: "Original",
    purchaseDate: "2026-10-02",
  };
}

async function legacyArchive(
  record: Purchase,
  evidence: string,
  compression: "STORE" | "DEFLATE" = "DEFLATE",
) {
  const zip = new JSZip();
  zip.file(
    "holdfast.json",
    JSON.stringify({ schemaVersion: 1, purchases: [purchaseMetadata(record)] }),
  );
  zip.file(`evidence/${record.id}/document`, evidence);

  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression }));
}

// Fixture corruption only: JSZip deliberately does not write false local/central size declarations.
function underreportSize(bytes: Buffer, entryName: string) {
  const corrupted = Buffer.from(bytes);
  const name = Buffer.from(entryName);
  let position = corrupted.indexOf(name);
  let patched = 0;

  while (position !== -1) {
    for (const [headerSize, signature, sizeOffset] of [
      [30, 0x04034b50, 22],
      [46, 0x02014b50, 24],
    ]) {
      const header = position - headerSize;

      if (header >= 0 && corrupted.readUInt32LE(header) === signature) {
        corrupted.writeUInt32LE(1, header + sizeOffset);
        patched++;
      }
    }

    position = corrupted.indexOf(name, position + name.length);
  }

  expect(patched).toBe(2);

  return corrupted;
}

it("rejects forged compressed sizes before retaining over-budget output", async () => {
  const record = purchase();
  record.attachments = [
    { id: "document", name: "receipt.txt", type: "text/plain", size: 1, blob: new Blob(["x"]) },
  ];
  const entryName = `evidence/${record.id}/document`;
  const bytes = underreportSize(await legacyArchive(record, "x".repeat(1024 * 1024)), entryName);
  const file = new File([bytes], "forged.zip");
  await expect(importBackup([file])).rejects.toThrow(/uncompressed size/i);

  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, checkCrc32: true });
  let received = 0;

  try {
    const entry = (await reader.getEntries()).find((item) => item.filename === entryName);

    if (!entry || entry.directory) {
      throw new Error("The forged fixture has no evidence entry.");
    }

    await expect(
      entry.getData(
        new WritableStream<Uint8Array>({
          write(chunk) {
            received += chunk.length;
          },
        }),
      ),
    ).rejects.toThrow(/uncompressed size/i);
    expect(received).toBeLessThanOrEqual(1);
  } finally {
    await reader.close();
  }
});

it("rejects corrupt legacy evidence by CRC and accepts a later valid retry", async () => {
  const record = purchase();
  const original = "ORIGINAL_RECEIPT_BYTES";
  record.attachments = [
    {
      id: "document",
      name: "receipt.txt",
      type: "text/plain",
      size: original.length,
      blob: new Blob([original]),
    },
  ];
  const bytes = await legacyArchive(record, original, "STORE");
  const damaged = Buffer.from(bytes);
  const payload = damaged.indexOf(Buffer.from(original));
  expect(payload).toBeGreaterThan(0);
  damaged[payload] ^= 1;
  await expect(importBackup([new File([damaged], "bad-crc.zip")])).rejects.toThrow(
    /CRC|signature/i,
  );
  const restored = await importBackup([new File([bytes], "valid.zip")]);
  expect(await restored[0].attachments[0].blob.text()).toBe(original);
});

it("rejects repeated purchase identities in a legacy backup", async () => {
  const record = purchaseMetadata(purchase());
  const zip = new JSZip();
  zip.file("holdfast.json", JSON.stringify({ schemaVersion: 1, purchases: [record, record] }));
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  await expect(importBackup([new File([bytes], "duplicate.zip")])).rejects.toThrow(
    "Duplicate purchase IDs",
  );
});

it("never returns a generated prefix when an original document is inconsistent", async () => {
  const record = purchase();
  record.attachments = [
    { id: "document", name: "receipt.txt", type: "text/plain", size: 4, blob: new Blob(["abc"]) },
  ];
  await expect(exportBackup([record])).rejects.toThrow("Original evidence size does not match");
  record.attachments[0].size = 3;
  const parts = await exportBackup([record]);
  const restored = await importBackup(parts.map((part) => new File([part.blob], part.name)));
  expect(await restored[0].attachments[0].blob.text()).toBe("abc");
});

it("aborts an active export and leaves a subsequent export usable", async () => {
  const controller = new AbortController();
  const pending = exportBackup([purchase()], { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow(/abort|Backup creation failed/i);
  expect(await exportBackup([purchase()])).toHaveLength(1);
});

it("honors cancellation before archive parsing", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    importBackup([new File(["invalid"], "backup.zip")], { signal: controller.signal }),
  ).rejects.toThrow(/abort/i);
});
