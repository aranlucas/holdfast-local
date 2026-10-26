import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { exportBackup, importBackup } from "@/backup";
import { purchaseMetadata } from "@/backup-schema";
import { blankPurchase } from "@/model";
import type { Purchase } from "@/model";

function purchase(): Purchase {
  return {
    ...blankPurchase(),
    merchant: "Synthetic backup shop",
    item: "Original purchase",
    purchaseDate: "2026-10-02",
    synthetic: true,
  };
}

async function digest(blob: Blob) {
  return createHash("sha256")
    .update(new Uint8Array(await blob.arrayBuffer()))
    .digest("hex");
}

async function roundTrip(original: Purchase[]) {
  const parts = await exportBackup(original);

  return importBackup(parts.map((part) => new File([part.blob], part.name)));
}

describe("complete cabinet backups", () => {
  it.each([
    { count: 501, receiptLength: 0 },
    { count: 54, receiptLength: 100000 },
  ])(
    "round trips $count purchases with $receiptLength receipt characters",
    async ({ count, receiptLength }) => {
      const original = purchase();

      const purchases = Array.from({ length: count }, (_, index) => ({
        ...original,
        id: `backup-${index}`,
        receiptText: "x".repeat(receiptLength),
      }));

      const archive = await exportBackup(purchases);
      const restored = await importBackup(archive.map((part) => new File([part.blob], part.name)));

      expect(restored).toEqual(purchases);
    },
  );

  it("retains an original filename accepted by receipt import", async () => {
    const original = purchase();
    const name = `${"r".repeat(240)}.txt`;
    const blob = new File(["original receipt bytes"], name, { type: "text/plain" });
    original.attachments = [{ id: "receipt", name, type: blob.type, size: blob.size, blob }];

    const archive = await exportBackup([original]);
    const restored = await importBackup(archive.map((part) => new File([part.blob], part.name)));

    expect(restored[0].attachments[0].name).toBe(name);
    expect(await restored[0].attachments[0].blob.text()).toBe(await blob.text());
  });

  it("preserves a record whose escaped text exceeds the old whole-manifest limit", async () => {
    const original = purchase();
    const text = "\0".repeat(100000);
    original.notes = text;
    original.receiptText = text;
    original.sourceLabel = text;
    original.policy.text = text;
    original.policy.notes = text;

    for (const evidence of Object.values(original.evidence)) {
      evidence.excerpt = text;
    }

    expect(new Blob([JSON.stringify(purchaseMetadata(original))]).size).toBeGreaterThan(
      5 * 1024 * 1024,
    );
    expect(await roundTrip([original])).toEqual([original]);
  });

  it("reassembles UTF-8 when a metadata chunk ends inside an emoji", async () => {
    const original = purchase();
    original.notes = "😇";
    const json = JSON.stringify(purchaseMetadata(original));
    const prefix = new TextEncoder().encode(json.slice(0, json.indexOf("😇"))).length;
    original.notes = `${"a".repeat(1024 * 1024 - prefix - 1)}😇`;

    expect((await roundTrip([original]))[0].notes).toBe(original.notes);
  });

  it.each([
    { count: 20, receiptLength: 100000 },
    { count: 501, receiptLength: 0 },
  ])(
    "reads genuine version-1 JSON with $count records and $receiptLength receipt characters",
    async ({ count, receiptLength }) => {
      const original = purchase();

      const records = Array.from({ length: count }, (_, index) => ({
        ...original,
        id: `legacy-${index}`,
        receiptText: "x".repeat(receiptLength),
      }));

      records[0].attachments = [
        {
          id: "document",
          name: "receipt.txt",
          type: "text/plain",
          size: 3,
          blob: new Blob(["abc"]),
        },
      ];
      const zip = new JSZip();
      zip.file(
        "holdfast.json",
        JSON.stringify({ schemaVersion: 1, purchases: records.map(purchaseMetadata) }),
      );
      zip.file("evidence/legacy-0/document", "abc");
      const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      const restored = await importBackup([new File([new Uint8Array(bytes)], "legacy.zip")]);

      expect(restored.map(purchaseMetadata)).toEqual(records.map(purchaseMetadata));
      expect(await restored[0].attachments[0].blob.text()).toBe("abc");
    },
  );
});

describe("complete multipart sets", () => {
  let files: File[];
  let original: Purchase;
  let expectedDigest: string;

  beforeAll(async () => {
    original = purchase();
    const blob = new Blob([new Uint8Array(12 * 1024 * 1024).fill(91)]);
    expectedDigest = await digest(blob);
    original.attachments = Array.from({ length: 10 }, (_, index) => ({
      id: `document-${index}`,
      name: `original-${index}.bin`,
      type: "application/octet-stream",
      size: blob.size,
      blob,
    }));
    const parts = await exportBackup([original]);
    files = parts.map((part) => new File([part.blob], part.name));
  }, 30000);

  it("round trips one purchase's full 120 MiB across volumes selected out of order", async () => {
    expect(files).toHaveLength(4);
    expect(files.filter((file) => file.name.endsWith(".holdfast.json"))).toHaveLength(1);
    const restored = await importBackup([files[2], files[0], files[3], files[1]]);
    expect(restored.map(purchaseMetadata)).toEqual([purchaseMetadata(original)]);

    for (const attachment of restored[0].attachments) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each original's full bytes without retaining ten digest inputs at once.
      expect(await digest(attachment.blob)).toBe(expectedDigest);
    }
  }, 30000);

  it.each([0, 1, 2, 3])("rejects a set missing file %i", async (missing) => {
    await expect(importBackup(files.filter((_, index) => index !== missing))).rejects.toThrow(
      /backup index|every volume/i,
    );
  });

  it("rejects duplicate files", async () => {
    await expect(importBackup([files[0], files[0], files[2], files[3]])).rejects.toThrow(
      "Duplicate",
    );
  });

  it("rejects an additional unrelated file", async () => {
    await expect(importBackup([...files, new File(["x"], "unrelated.zip")])).rejects.toThrow(
      /Select the backup index/,
    );
  });

  it("rejects changed bytes even when filename and size match", async () => {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    const damaged = new File([bytes], files[0].name);
    await expect(importBackup([damaged, ...files.slice(1)])).rejects.toThrow("checksum");
  });
});
