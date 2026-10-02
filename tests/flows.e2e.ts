import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import AxeBuilder from "@axe-core/playwright";
const evidence = process.env.HOLDFAST_EVIDENCE_DIR || "/tmp/holdfast-qa";
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
}
async function demo(page: Page) {
  await mkdir(evidence, { recursive: true });
  await page.getByRole("button", { name: "Try a sample shelf" }).click();
  await expect(
    page.getByRole("button", { name: "Open Studio wireless headphones" }),
  ).toBeVisible();
}
async function fact(page: Page, text: string) {
  await page.getByRole("checkbox", { name: text }).check();
  await page.getByRole("button", { name: "Confirm & continue" }).click();
}
async function paste(page: Page, text: string) {
  await page.getByRole("button", { name: "Add receipt", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Receipt text", exact: true })
    .fill(text);
  await page
    .getByRole("button", { name: "Verify three facts", exact: true })
    .click();
}
function makePDF() {
  const lines = [
    "Merchant: Test PDF Store",
    "Purchase date: 2026-10-01",
    "Item: Small desk clock",
    "Order: TEST-PDF-1",
    "Total: USD 24.00",
  ];
  const stream = `BT /F1 14 Tf 50 740 Td ${lines.map((l, i) => `${i ? "0 -24 Td " : ""}(${l}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(data);
}
test("desktop shelf, filters, timeline, packet and original data stay local", async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4319") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await open(page);
  await expect(page).toHaveTitle("Holdfast · Receipts, ready");
  await page.screenshot({
    path: `${evidence}/holdfast-empty-desktop.png`,
    fullPage: true,
  });
  await demo(page);
  await page.screenshot({
    path: `${evidence}/holdfast-shelf-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("searchbox", { name: "Search purchases" }).fill("lamp");
  await expect(
    page.getByRole("button", { name: "Open Arc desk lamp" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Studio wireless headphones" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Policy needed", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nothing in this view." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all purchases" }).click();
  await page.getByRole("button", { name: "Coming up", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Studio wireless headphones" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Arc desk lamp" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Studio wireless headphones" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Policy and item eligibility" })
    .check();
  await expect(page.getByText("2 of 5 ready")).toBeVisible();
  await page
    .getByLabel("Condition / preparation notes")
    .fill("Unopened. Original cable in the box.");
  await page.getByLabel("Serial number", { exact: true }).fill("SYNTHETIC-123");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByRole("button", { name: "Notes saved" })).toBeVisible();
  await page.screenshot({
    path: `${evidence}/holdfast-proof-desktop.png`,
    fullPage: false,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export proof packet", exact: true })
    .click();
  const file = await download;
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(Object.keys(zip.files)).toContain("proof-packet.html");
  const html = await zip.file("proof-packet.html")!.async("string");
  expect(html).toContain("Unopened. Original cable in the box.");
  expect(html).toContain("SYNTHETIC-123");
  expect(html).toContain("Synthetic");
  await file.saveAs(`${evidence}/holdfast-synthetic-proof-packet.zip`);
  const printDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download printable summary" })
    .click();
  await (
    await printDownload
  ).saveAs(`${evidence}/holdfast-synthetic-print-summary.html`);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Studio wireless headphones" })
    .click();
  await expect(page.getByLabel("Condition / preparation notes")).toHaveValue(
    "Unopened. Original cable in the box.",
  );
  await expect(
    page.getByRole("checkbox", { name: "Policy and item eligibility" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room to decide." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Returns", exact: true }).click();
  await expect(
    page.getByText("Recorded warranty end", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Still a question mark." }),
  ).toBeVisible();
  await page.screenshot({
    path: `${evidence}/holdfast-timeline-desktop.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("human confirmation, ambiguous date, custom delivery policy, edit and unknown", async ({
  page,
}) => {
  await open(page);
  await paste(
    page,
    "Merchant: Hand-entered Store\nDate: 02/03/2026\nItem: Commuter bag\nTotal: USD 59.00",
  );
  await page.getByRole("button", { name: "Confirm & continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm this fact");
  await fact(page, "I checked the merchant, item, and amount.");
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveValue(
    "",
  );
  await page.getByText("Source evidence", { exact: true }).click();
  await expect(
    page.getByText("Ambiguous numeric date.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Purchase date", { exact: true }).fill("2026-03-02");
  await page
    .getByLabel("Delivery / received date", { exact: true })
    .fill("2026-03-04");
  await fact(page, "I checked the purchase date and any delivery date.");
  await page.getByLabel("Return rule", { exact: true }).selectOption("days");
  await page.getByLabel("Return window (days)").fill("14");
  await page.getByLabel("Return window starts on").selectOption("arrival");
  await page
    .getByLabel("Count the start date as day 1", { exact: false })
    .check();
  await page
    .getByLabel("Policy source label")
    .fill("User-entered bag policy, checked 2 March");
  await page
    .getByLabel("Policy text and conditions")
    .fill(
      "This bag: 14 days from delivery, delivery is day one. Verify condition and fees.",
    );
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(
    page.getByRole("heading", { name: "Commuter bag", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("March 17, 2026", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review facts" }).click();
  await fact(page, "I checked the merchant, item, and amount.");
  await fact(page, "I checked the purchase date and any delivery date.");
  await page.getByLabel("Return rule", { exact: true }).selectOption("unknown");
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(
    page.getByRole("dialog").getByText("Policy needed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("March 17, 2026", { exact: true })).toHaveCount(
    0,
  );
});
test("local PDF text layer, failed import retry, attachment bytes and packet", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add receipt", exact: true }).click();
  await page.getByLabel("Receipt file", { exact: true }).setInputFiles({
    name: "unsupported.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>x</h1>"),
  });
  await expect(page.getByRole("alert")).toContainText("Other files");
  await page.getByLabel("Receipt file", { exact: true }).setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: makePDF(),
  });
  await expect(
    page.getByRole("heading", { name: "What did you buy?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Merchant", { exact: true })).toHaveValue(
    "Test PDF Store",
  );
  await expect(
    page.getByLabel("Item you are tracking", { exact: true }),
  ).toHaveValue("Small desk clock");
  await fact(page, "I checked the merchant, item, and amount.");
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  await fact(page, "I checked the purchase date and any delivery date.");
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(page.getByRole("button", { name: "receipt.pdf" })).toBeVisible();
  await page.getByLabel("Evidence file", { exact: true }).setInputFiles({
    name: "condition.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic condition note"),
  });
  await expect(
    page.getByRole("button", { name: "condition.txt" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export proof packet", exact: true })
    .click();
  const zip = await JSZip.loadAsync(
    await readFile((await (await download).path())!),
  );
  const pdfName = Object.keys(zip.files).find((n) =>
    n.endsWith("-receipt.pdf"),
  )!;
  expect(await zip.file(pdfName)!.async("nodebuffer")).toEqual(makePDF());
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open Small desk clock" }).click();
  await expect(
    page.getByRole("button", { name: "condition.txt" }),
  ).toBeVisible();
});
test("backup restore, malformed backup recovery, clear and closed outcomes", async ({
  page,
}) => {
  await open(page);
  await demo(page);
  await page.getByRole("button", { name: "Open Pour-over kettle" }).click();
  await page.getByLabel("Outcome", { exact: true }).selectOption("returned");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Pour-over kettle" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Arc desk lamp" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My device", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download device backup" }).click();
  const backup = await download;
  const path = (await backup.path())!;
  await backup.saveAs(`${evidence}/holdfast-synthetic-backup.zip`);
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "bad.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear this device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, clear this device", exact: true })
    .click();
  await expect(
    page.getByText("This device cabinet is now empty."),
  ).toBeVisible();
  await page.getByLabel("Backup file", { exact: true }).setInputFiles(path);
  await expect(
    page.getByText("Restored 4 purchases.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My shelf", exact: false }).click();
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Pour-over kettle" }),
  ).toBeVisible();
});
test("fully offline reload, extraction, PDF lazy loading, save and export", async ({
  page,
  context,
}) => {
  await open(page);
  await expect(
    page.getByText("Ready to work offline", { exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
  await page.getByRole("button", { name: "Add receipt", exact: true }).click();
  await page.getByLabel("Receipt file", { exact: true }).setInputFiles({
    name: "offline.pdf",
    mimeType: "application/pdf",
    buffer: makePDF(),
  });
  await expect(page.getByLabel("Merchant", { exact: true })).toHaveValue(
    "Test PDF Store",
  );
  await fact(page, "I checked the merchant, item, and amount.");
  await fact(page, "I checked the purchase date and any delivery date.");
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(
    page.getByRole("heading", { name: "Small desk clock", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export proof packet", exact: true })
    .click();
  expect((await download).suggestedFilename()).toContain("proof.zip");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open Small desk clock" }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("mobile flow, dialog usability, persistence and no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await demo(page);
  await page.screenshot({
    path: `${evidence}/holdfast-shelf-mobile.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open Studio wireless headphones" })
    .click();
  await page
    .getByRole("checkbox", { name: "Packaging and accessories" })
    .check();
  await page.getByRole("button", { name: "Review facts" }).click();
  await fact(page, "I checked the merchant, item, and amount.");
  await fact(page, "I checked the purchase date and any delivery date.");
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/holdfast-proof-mobile.png`,
    fullPage: false,
  });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room to decide." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("keyboard focus trap and escape restore focus", async ({ page }) => {
  await open(page);
  const add = page.getByRole("button", { name: "Add receipt", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("accessible names, landmarks and AA contrast on desktop and mobile", async ({
  page,
}) => {
  await open(page);
  await demo(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  await page
    .getByRole("button", { name: "Open Studio wireless headphones" })
    .click();
  const detail = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    detail.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});

test("write failure keeps the verified draft and succeeds on retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "holdfastBlockWrites", {
      value: true,
      writable: true,
    });
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (
        (window as unknown as { holdfastBlockWrites: boolean })
          .holdfastBlockWrites
      )
        throw new DOMException("Synthetic quota limit", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await open(page);
  await paste(
    page,
    "Merchant: Retry Store\nDate: 2026-10-02\nItem: Test notebook\nTotal: USD 9.00",
  );
  await fact(page, "I checked the merchant, item, and amount.");
  await fact(page, "I checked the purchase date and any delivery date.");
  await page
    .getByRole("checkbox", {
      name: "I checked the item-specific rule, or intentionally left it unknown.",
    })
    .check();
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save on this device",
  );
  await expect(
    page.getByRole("heading", { name: "Which rule applies to this item?" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { holdfastBlockWrites: boolean }
    ).holdfastBlockWrites = false;
  });
  await page.getByRole("button", { name: "Save to my shelf" }).click();
  await expect(
    page.getByRole("heading", { name: "Test notebook", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open Test notebook" }),
  ).toBeVisible();
});
test("saved calendar dates stay fixed across browser time zones", async ({
  browser,
}) => {
  for (const timezoneId of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4319");
    await paste(
      page,
      "Merchant: Zone Test\nDate: 2024-02-29\nItem: Leap day clock\nTotal: USD 18.00",
    );
    await fact(page, "I checked the merchant, item, and amount.");
    await fact(page, "I checked the purchase date and any delivery date.");
    await page.getByLabel("Return rule", { exact: true }).selectOption("days");
    await page.getByLabel("Return window (days)").fill("30");
    await page
      .getByLabel("Warranty rule", { exact: true })
      .selectOption("months");
    await page
      .getByLabel("Policy source label")
      .fill("Synthetic calendar boundary test");
    await page
      .getByRole("checkbox", {
        name: "I checked the item-specific rule, or intentionally left it unknown.",
      })
      .check();
    await page.getByRole("button", { name: "Save to my shelf" }).click();
    await expect(
      page.getByRole("dialog").getByText("March 30, 2024", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("February 28, 2025", { exact: true }),
    ).toBeVisible();
    await context.close();
  }
});
