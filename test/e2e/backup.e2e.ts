import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { exportBackup, importBackup } from "@/backup";
import { purchaseMetadata } from "@/backup-schema";
import { blankPurchase } from "@/model";
import type { Purchase } from "@/model";
import { required } from "@test/helpers/required";

type Upload = { name: string; mimeType: string; buffer: Buffer };

type HashGate = { remaining: number; releases: (() => void)[]; completed: number };

declare global {
  interface Window {
    backupHashGate: HashGate;
  }
}

let uploads: Upload[];

let original: Purchase;

let originalHash: string;

test.beforeAll(async () => {
  const bytes = new Uint8Array(10 * 1024 * 1024).fill(73);
  originalHash = createHash("sha256").update(bytes).digest("hex");
  const blob = new Blob([bytes]);
  original = {
    ...blankPurchase(),
    merchant: "Synthetic backup shop",
    item: "Multipart purchase",
    purchaseDate: "2026-10-02",
    attachments: Array.from({ length: 6 }, (_, index) => ({
      id: `document-${index}`,
      name: `original-${index}.bin`,
      type: "application/octet-stream",
      size: blob.size,
      blob,
    })),
  };
  const parts = await exportBackup([original]);
  uploads = [];

  for (const part of parts) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Prepare one bounded upload buffer at a time.
    const buffer = Buffer.from(await part.blob.arrayBuffer());
    uploads.push({ name: part.name, mimeType: part.blob.type, buffer });
  }
});

async function openDevice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "My device", exact: true }).click();
}

async function holdHashes(page: Page, remaining: number) {
  await page.addInitScript((count) => {
    const gate: HashGate = { remaining: count, releases: [], completed: 0 };
    window.backupHashGate = gate;
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper preserves the native SubtleCrypto receiver.
    const digest = SubtleCrypto.prototype.digest;
    SubtleCrypto.prototype.digest = async function (...args: Parameters<typeof digest>) {
      if (gate.remaining > 0) {
        gate.remaining--;
        await new Promise<void>((resolve) => {
          gate.releases.push(resolve);
        });
      }

      const result = await digest.apply(this, args);
      gate.completed++;

      return result;
    };
  }, remaining);
}

test("downloads the complete multipart set and restores all original bytes", async ({
  page,
  context,
}) => {
  await openDevice(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.getByLabel("Backup file", { exact: true }).setInputFiles(uploads);
  await expect(page.getByText("Restored 1 purchases.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Download device backup", exact: true }).click();
  const buttons = page.getByRole("button", { name: /^Download file / });
  await expect(buttons).toHaveCount(3);
  const downloaded: Upload[] = [];

  for (let index = 0; index < 3; index++) {
    const event = page.waitForEvent("download");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Every file is a separate user-triggered browser download.
    await buttons.nth(index).click();
    // oxlint-disable-next-line eslint/no-await-in-loop -- Wait for this file before starting another download.
    const download = await event;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Native download completion owns this path.
    const path = required(await download.path(), "Expected a completed backup download");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Retain downloaded files in volume order for the subsequent restore.
    const buffer = await readFile(path);
    downloaded.push({
      name: download.suggestedFilename(),
      mimeType: "application/octet-stream",
      buffer,
    });
  }

  const restored = await importBackup(
    downloaded.map((file) => new File([new Uint8Array(file.buffer)], file.name)),
  );

  expect(restored.map(purchaseMetadata)).toEqual([purchaseMetadata(original)]);

  for (const attachment of restored[0].attachments) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each downloaded original without concurrent large digest buffers.
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(originalHash);
  }

  await page.getByRole("button", { name: "Clear this device", exact: true }).click();
  await page.getByRole("button", { name: "Yes, clear this device", exact: true }).click();
  await expect(page.getByText("This device cabinet is now empty.")).toBeVisible();
  await page.getByLabel("Backup file", { exact: true }).setInputFiles(downloaded.slice(0, 2));
  await expect(page.getByRole("alert")).toContainText("backup index");
  await page.reload();
  await page.getByRole("button", { name: "My device", exact: true }).click();
  await expect(page.locator(".device-facts").getByText("0", { exact: true })).toBeVisible();
  await page
    .getByLabel("Backup file", { exact: true })
    .setInputFiles([downloaded[2], downloaded[0], downloaded[1]]);
  await expect(page.getByText("Restored 1 purchases.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Open Multipart purchase / })).toBeVisible();
});

test("a canceled restore cannot clear a newer restore's selected files or working state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await holdHashes(page, 2);
  await openDevice(page);
  const input = page.getByLabel("Backup file", { exact: true });
  await input.setInputFiles(uploads);
  await page.waitForFunction(() => window.backupHashGate.releases.length === 1);
  await page.getByRole("button", { name: "Cancel backup operation", exact: true }).click();
  expect(await input.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(0);
  await input.setInputFiles(uploads);
  await page.waitForFunction(() => window.backupHashGate.releases.length === 2);
  await page.evaluate(() => window.backupHashGate.releases[0]());
  await page.waitForFunction(() => window.backupHashGate.completed === 1);
  await expect(input).toBeDisabled();
  expect(await input.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(3);
  await page.evaluate(() => window.backupHashGate.releases[1]());
  await expect(page.getByText("Restored 1 purchases.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("leaving the device view cancels validation before any restore is saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await holdHashes(page, 1);
  await openDevice(page);
  await page.getByLabel("Backup file", { exact: true }).setInputFiles(uploads);
  await page.waitForFunction(() => window.backupHashGate.releases.length === 1);
  await page.getByRole("button", { name: "My shelf", exact: false }).click();
  await page.evaluate(() => window.backupHashGate.releases[0]());
  await page.waitForFunction(() => window.backupHashGate.completed === 1);
  await page.reload();
  await page.getByRole("button", { name: "My device", exact: true }).click();
  await expect(page.locator(".device-facts").getByText("0", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
