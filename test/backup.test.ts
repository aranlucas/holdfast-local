import { describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "@/backup";
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
});
