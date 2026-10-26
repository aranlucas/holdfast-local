import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { exportBackup } from "@/exports";
import { blankPurchase } from "@/model";
import type { Purchase } from "@/model";

async function restore(page: Page, purchases: Purchase[]) {
  const archive = await exportBackup(purchases);
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "transaction-test.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archive.arrayBuffer()),
  });
}

function readCabinet(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("holdfast-v1", 1);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Database open failed")),
      );
    });

    try {
      return await new Promise<Purchase[]>((resolve, reject) => {
        const transaction = database.transaction("purchases", "readonly");
        const request = transaction.objectStore("purchases").getAll();
        transaction.addEventListener("complete", () => resolve(request.result));
        transaction.addEventListener("abort", () =>
          reject(transaction.error ?? new Error("Read aborted")),
        );
      });
    } finally {
      database.close();
    }
  });
}

for (const failure of ["synchronous", "request"] as const) {
  test(`restore rolls back a ${failure} write failure and retries without unhandled errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const original = {
      ...blankPurchase(),
      merchant: "Synthetic transaction shop",
      item: "Original purchase",
      purchaseDate: "2026-10-02",
      confirmedAt: "2026-10-02T12:00:00Z",
    };

    const addition = { ...original, id: crypto.randomUUID(), item: "Additional purchase" };
    await page.goto("/");
    await page.getByRole("button", { name: "My device", exact: true }).click();
    await restore(page, [original]);
    await expect(page.getByText("Restored 1 purchases.", { exact: false })).toBeVisible();

    await page.evaluate(
      ({ mode, originalId }) => {
        let writes = 0;
        // oxlint-disable-next-line typescript/unbound-method -- Inject a one-shot storage failure while preserving the native receiver.
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
          if (++writes !== 2) {
            return put.apply(this, args);
          }

          IDBObjectStore.prototype.put = put;

          if (mode === "synchronous") {
            throw new DOMException("Synthetic clone failure", "DataCloneError");
          }

          // A duplicate key fails asynchronously in the real browser transaction.
          return this.add({ id: originalId });
        };
      },
      { mode: failure, originalId: original.id },
    );

    const update = { ...original, notes: "New notes from backup" };
    await restore(page, [update, addition]);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("AbortError");
    expect(await readCabinet(page)).toEqual([original]);
    expect(errors).toEqual([]);

    await restore(page, [update, addition]);
    await expect(page.getByText("Restored 2 purchases.", { exact: false })).toBeVisible();
    expect(await readCabinet(page)).toEqual(expect.arrayContaining([update, addition]));
    expect(await readCabinet(page)).toHaveLength(2);
    expect(errors).toEqual([]);
  });
}
