import { expect, test } from "@playwright/test";
import { exportBackup } from "@/backup";
import { blankPurchase } from "@/model";

declare global {
  interface Window {
    holdfastReleaseSave: boolean;
  }
}

test("notes cannot change under a pending save acknowledgement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample shelf" }).click();
  await page.getByRole("button", { name: /^Open Studio wireless headphones/ }).click();
  const notes = page.getByLabel("Condition / preparation notes");
  const serial = page.getByLabel("Serial number", { exact: true });
  await notes.fill("Committed notes");
  await serial.fill("COMMITTED-123");
  await page.evaluate(() => {
    window.holdfastReleaseSave = false;
    // oxlint-disable-next-line typescript/unbound-method -- Preserve the native receiver when injecting transaction latency.
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      IDBObjectStore.prototype.put = put;
      const result = put.apply(this, args);

      const keepAlive = () => {
        if (!window.holdfastReleaseSave) {
          this.get("latency-fixture").addEventListener("success", keepAlive);
        }
      };

      result.addEventListener("success", keepAlive);

      return result;
    };
  });
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save notes", exact: true })).toBeDisabled();
  await expect(notes).toBeDisabled();
  await expect(serial).toBeDisabled();
  await page.evaluate(() => {
    window.holdfastReleaseSave = true;
  });
  await expect(page.getByRole("button", { name: "Notes saved" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Open Studio wireless headphones/ }).click();
  await expect(notes).toHaveValue("Committed notes");
  await expect(serial).toHaveValue("COMMITTED-123");
});

test("committed restore with failed refresh offers read retry without repeating writes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample shelf" }).click();
  await expect(
    page.getByRole("button", { name: /^Open Studio wireless headphones/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My device", exact: true }).click();
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Inject one real read-request failure, preserving native receiver for retries.
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<typeof getAll>) {
      IDBObjectStore.prototype.getAll = getAll;
      const request = getAll.apply(this, args);
      this.transaction.abort();

      return request;
    };
  });

  const original = {
    ...blankPurchase(),
    merchant: "Audit shop",
    item: "Restored proof",
    purchaseDate: "2026-10-02",
  };

  const [part] = await exportBackup([original]);
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: part.name,
    mimeType: "application/zip",
    buffer: Buffer.from(await part.blob.arrayBuffer()),
  });
  await expect(page.getByRole("alert")).toContainText("Your backup was saved");
  await page.getByRole("button", { name: "Retry device storage" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".device-facts").getByText("5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^My shelf/ }).click();
  await expect(page.getByRole("button", { name: /^Open Restored proof/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Open Studio wireless headphones/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Open Restored proof/ })).toBeVisible();
});
