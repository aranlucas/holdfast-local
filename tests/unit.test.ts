import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  blankPurchase,
  daysLeft,
  isDate,
  returnDeadline,
  returnStatus,
  todayInZone,
  validatePurchase,
  warrantyDeadline,
} from "../src/model";
import { extractReceipt, readReceiptFile } from "../src/extraction";
import { demoPurchases, samplePolicy, sampleText } from "../src/samples";
import {
  escapeHTML,
  exportBackup,
  exportPacket,
  importBackup,
  packetHTML,
  safeName,
  validateBackupRecord,
} from "../src/exports";
import JSZip from "jszip";
function fixture() {
  const p = extractReceipt(sampleText("2026-10-02"));
  p.policy = samplePolicy();
  p.synthetic = true;
  return p;
}
describe("calendar dates independent of timestamps", () => {
  it.each([
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-04-31", false],
    ["2026-10-02", true],
    ["2026-2-01", false],
    ["2026-10-02T00:00Z", false],
    ["1899-01-01", false],
  ])("validates %s", (date, valid) => expect(isDate(date)).toBe(valid));
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-28", 2, "2024-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-08", 1, "2026-03-09"],
    ["2026-11-01", 1, "2026-11-02"],
  ])("adds days across boundaries %s", (date, n, result) =>
    expect(addDays(date, n)).toBe(result),
  );
  it.each([
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2026-12-31", 2, "2027-02-28"],
  ])("clamps month-end %s", (date, n, result) =>
    expect(addMonths(date, n)).toBe(result),
  );
  it("distinguishes local today in time zones", () => {
    const now = new Date("2026-10-02T00:30:00Z");
    expect(todayInZone("America/Los_Angeles", now)).toBe("2026-10-01");
    expect(todayInZone("Pacific/Kiritimati", now)).toBe("2026-10-02");
  });
  it("has a full final day at calendar granularity", () => {
    expect(daysLeft("2026-10-02", "2026-10-02")).toBe(0);
    expect(daysLeft("2026-10-02", "2026-10-03")).toBe(-1);
  });
  it("rejects invalid dates in calculations", () =>
    expect(() => addDays("2026-02-30", 1)).toThrow());
});
describe("confirmed item-specific policies", () => {
  it("never assumes a return or warranty duration", () => {
    const p = blankPurchase();
    p.purchaseDate = "2026-10-02";
    expect(returnDeadline(p).date).toBeNull();
    expect(warrantyDeadline(p).date).toBeNull();
  });
  it("makes day zero versus day one explicit", () => {
    const p = fixture();
    expect(returnDeadline(p).date).toBe("2026-10-07");
    p.policy.countStart = true;
    expect(returnDeadline(p).date).toBe("2026-10-06");
    expect(returnDeadline(p).explanation).toContain("day 1");
  });
  it("does not invent a delivery date", () => {
    const p = fixture();
    p.policy.startOn = "arrival";
    expect(returnDeadline(p).state).toBe("unknown");
    expect(validatePurchase(p)).toContain(
      "Enter the delivery date used by your rule, or choose a purchase-date rule.",
    );
    p.arrivalDate = "2026-09-15";
    expect(returnDeadline(p).date).toBe("2026-10-15");
  });
  it("allows an exact date to override durations", () => {
    const p = fixture();
    p.policy.returnMode = "date";
    p.policy.returnDate = "2026-12-31";
    p.policy.warrantyMode = "date";
    p.policy.warrantyDate = "2027-01-15";
    expect(returnDeadline(p).date).toBe("2026-12-31");
    expect(warrantyDeadline(p).date).toBe("2027-01-15");
  });
  it("records no stated window without asserting entitlement", () => {
    const p = fixture();
    p.policy.returnMode = "none";
    expect(returnDeadline(p).state).toBe("none");
    expect(returnStatus(p).label).toBe("No stated window");
  });
  it("rejects missing sources and item scope", () => {
    const p = fixture();
    p.policy.sourceLabel = "";
    p.policy.appliesTo = "";
    expect(validatePurchase(p)).toHaveLength(2);
  });
  it("rejects fractional durations, reversed delivery and earlier end date", () => {
    const p = fixture();
    p.policy.returnDays = 1.5;
    expect(validatePurchase(p).join(" ")).toContain("whole number");
    p.arrivalDate = "2026-01-01";
    expect(validatePurchase(p).join(" ")).toContain("Delivery cannot");
    p.policy.returnMode = "date";
    p.policy.returnDate = "2025-01-01";
    expect(validatePurchase(p).join(" ")).toContain("before the purchase");
  });
  it("returns unknown rather than overflowing supported date range", () => {
    const p = fixture();
    p.purchaseDate = "2199-12-31";
    expect(returnDeadline(p).state).toBe("unknown");
    expect(warrantyDeadline(p).state).toBe("unknown");
  });
  it("keeps distinct product policies distinct", () => {
    const [a, b, c] = demoPurchases("2026-10-02");
    expect(a.policy.returnDays).toBe(30);
    expect(b.policy.returnDays).toBe(45);
    expect(c.policy.returnMode).toBe("unknown");
  });
  it("marks today, past dates and closed outcomes distinctly", () => {
    const p = fixture();
    expect(returnStatus(p, "2026-10-07").label).toBe("Recorded date is today");
    expect(returnStatus(p, "2026-10-08").key).toBe("passed");
    p.outcome = "returned";
    expect(returnStatus(p).key).toBe("closed");
  });
});
describe("transparent local extraction", () => {
  it("extracts values with line-level source evidence", () => {
    const p = fixture();
    expect(p.merchant).toBe("Northline Audio");
    expect(p.item).toBe("Studio wireless headphones");
    expect(p.amount).toBe("193.32");
    expect(p.purchaseDate).toBe("2026-09-07");
    expect(p.evidence.merchant.line).toBe(2);
    expect(p.evidence.purchaseDate.excerpt).toBe("Purchase date: 2026-09-07");
  });
  it("retains policy wording without enabling a return rule", () => {
    const p = extractReceipt(sampleText());
    expect(p.policy.text).toContain("SAMPLE RETURN");
    expect(p.policy.returnMode).toBe("unknown");
  });
  it("leaves ambiguous slash dates empty", () => {
    const p = extractReceipt(
      "Merchant: Shop\nDate: 02/03/2026\nItem: Hat\nTotal: USD 20.00",
    );
    expect(p.purchaseDate).toBe("");
    expect(p.evidence.purchaseDate.note).toContain("Ambiguous");
  });
  it("supports named dates and foreign currencies", () => {
    const p = extractReceipt(
      "Merchant: Shop\nDate: February 28, 2026\nItem: Hat\nSubtotal: 10.00\nTotal: EUR 12.00",
    );
    expect(p.purchaseDate).toBe("2026-02-28");
    expect(p.amount).toBe("12.00");
    expect(p.currency).toBe("EUR");
  });
  it("does not treat numeric month/day dates as ISO", () =>
    expect(extractReceipt("Date: 31/12/2026").purchaseDate).toBe(""));
  it("preserves an image as evidence without fake OCR", async () => {
    const p = await readReceiptFile(
      new File(["image data"], "photo.png", { type: "image/png" }),
    );
    expect(p.item).toBe("");
    expect(p.attachments[0].name).toBe("photo.png");
    expect(p.notes).toContain("not extracted");
  });
  it("rejects unsupported files with a retry path", async () => {
    await expect(
      readReceiptFile(new File(["x"], "script.html", { type: "text/html" })),
    ).rejects.toThrow("Other files");
  });
});
describe("portable, safe proof and backup exports", () => {
  it("escapes receipt text, field values, and source labels in HTML", () => {
    const p = fixture();
    p.item = "<script>alert(1)</script>";
    p.policy.sourceLabel = 'a" onclick="evil';
    const html = packetHTML(p);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&quot; onclick=&quot;evil");
    expect(escapeHTML("&<>")).toBe("&amp;&lt;&gt;");
  });
  it("does not expose path traversal in file names", () =>
    expect(safeName("../../evil.txt")).not.toContain("/"));
  it("creates an offline packet with original bytes and a checklist", async () => {
    const p = fixture();
    p.attachments = [
      {
        id: "original",
        name: "receipt.txt",
        type: "text/plain",
        size: 3,
        blob: new Blob(["abc"]),
      },
    ];
    const packet = await exportPacket(p);
    const zip = await JSZip.loadAsync(await packet.arrayBuffer());
    expect(
      await zip.file("evidence/original-receipt.txt")!.async("string"),
    ).toBe("abc");
    expect(zip.file("proof-packet.html")).not.toBeNull();
    expect(zip.file("checklist.md")).not.toBeNull();
    expect(await zip.file("purchase.json")!.async("string")).not.toContain(
      '"blob"',
    );
  });
  it("round trips purchases, checklist state and original evidence", async () => {
    const p = fixture();
    p.checklist.receipt = true;
    p.attachments = [
      {
        id: "file-1",
        name: "original.txt",
        type: "text/plain",
        size: 3,
        blob: new Blob(["abc"]),
      },
    ];
    const blob = await exportBackup([p]);
    const imported = await importBackup(new File([blob], "backup.zip"));
    expect(imported[0].id).toBe(p.id);
    expect(imported[0].checklist.receipt).toBe(true);
    expect(await imported[0].attachments[0].blob.text()).toBe("abc");
  });
  it("rejects malformed or unsupported backup schemas", () => {
    expect(() => validateBackupRecord({})).toThrow();
    const p = fixture();
    p.policy.returnMode = "evil" as never;
    expect(() => validateBackupRecord(p)).toThrow("policy");
  });
  it("rejects a proof packet used as a backup", async () => {
    const packet = await exportPacket(fixture());
    await expect(importBackup(new File([packet], "proof.zip"))).rejects.toThrow(
      "not a Holdfast backup",
    );
  });
  it("rejects missing attachment evidence before saving", async () => {
    const p = fixture();
    p.attachments = [
      {
        id: "file-1",
        name: "receipt.txt",
        type: "text/plain",
        size: 3,
        blob: new Blob(["abc"]),
      },
    ];
    const blob = await exportBackup([p]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.remove(`evidence/${p.id}/file-1`);
    const damaged = await zip.generateAsync({ type: "blob" });
    await expect(
      importBackup(new File([damaged], "damaged.zip")),
    ).rejects.toThrow("Missing evidence");
  });
});

it("labels a date with no purchase label as a suggestion", () => {
  const p = extractReceipt(
    "Merchant: Shop\nDelivery date: 2026-10-02\nItem: Hat",
  );
  expect(p.evidence.purchaseDate.confidence).toBe("medium");
  expect(p.evidence.purchaseDate.note).toContain("delivery date");
});
it("discloses the editable default for an unspecified dollar currency", () => {
  const p = extractReceipt(
    "Merchant: Shop\nDate: 2026-10-02\nItem: Hat\nTotal: $19.00",
  );
  expect(p.evidence.amount.note).toContain("USD is an editable default");
});
