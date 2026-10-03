import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { extractReceipt } from "../src/extraction";
import { itemDraft, receiptItems } from "../src/receiptItems";
import { calendarText } from "../src/calendar";
import { blankPurchase } from "../src/model";

const basket =
  "Merchant: Sample Shop\nPurchase date: 2024-02-28\nOrder: DEMO-1\nItem: Clock — EUR 12.00\nProduct: Lamp\nTax: EUR 4.20\nTotal: EUR 64.20\nReturn rules differ by product.";

describe("separate item verification from one receipt", () => {
  it("matches labeled items with source lines and leaves missing line amounts empty", () => {
    const items = receiptItems(basket);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      item: "Clock",
      amount: "12.00",
      currency: "EUR",
      line: 4,
      confidence: "high",
    });
    expect(items[1]).toMatchObject({ item: "Lamp", amount: "", line: 5 });
  });
  it("suggests likely priced products without copying totals, taxes or policy text", () => {
    const items = receiptItems(
      "Shop\nCotton hat $18.00\nBlue scarf GBP 12.50\nSubtotal: $30.50\nTax 3.00\nShipping 8.00\nReturn fee 2.00\nPaid 41.50",
    );

    expect(items.map((c) => c.item)).toEqual(["Cotton hat", "Blue scarf"]);
    expect(items[0].confidence).toBe("medium");
    expect(items[1].currency).toBe("GBP");
  });
  it("creates independent unconfirmed policies and keeps complete shared evidence", () => {
    const receipt = extractReceipt(basket);
    receipt.confirmedAt = "2024-02-28T12:00:00Z";
    receipt.policy.returnMode = "days";
    receipt.attachments = [
      {
        id: "original",
        name: "receipt.txt",
        type: "text/plain",
        size: 3,
        blob: new Blob(["abc"]),
      },
    ];
    const [a, b] = receiptItems(basket).map((c) => itemDraft(receipt, c));
    expect(a.id).not.toBe(b.id);
    expect(a.confirmedAt).toBe("");
    expect(a.policy.returnMode).toBe("unknown");
    expect(a.policy.warrantyMode).toBe("unknown");
    expect(b.amount).toBe("");
    expect(b.receiptText).toBe(basket);
    expect(b.attachments[0].blob).toBe(receipt.attachments[0].blob);
    a.policy.returnMode = "days";
    a.evidence.merchant.note = "edited";
    expect(b.policy.returnMode).toBe("unknown");
    expect(b.evidence.merchant.note).not.toBe("edited");
    expect(b.evidence.amount.note).toContain("total is not copied");
  });
  it("preserves duplicate product lines as distinct candidates", () => {
    const items = receiptItems("Item: Hat USD 9.00\nItem: Hat USD 9.00");
    expect(items).toHaveLength(2);
    expect(items.map((c) => c.line)).toEqual([1, 2]);
  });
  it("does not invent products for image/manual receipts", () => {
    expect(receiptItems("Photo retained. Enter manually.")).toEqual([]);
  });
});

function known() {
  const p = blankPurchase();
  p.merchant = "Synthetic Shop";
  p.item = "Leap clock";
  p.purchaseDate = "2024-02-28";
  p.confirmedAt = "2024-02-28T12:00:00Z";
  p.policy.returnMode = "days";
  p.policy.returnDays = 1;
  p.policy.warrantyMode = "months";
  p.policy.warrantyMonths = 12;
  p.policy.sourceLabel = "Synthetic boundary policy";

  return p;
}

function parse(text: string) {
  return new ICAL.Component(ICAL.parse(text)).getAllSubcomponents("vevent");
}

describe("RFC 5545 date-only calendar export", () => {
  it("parses all-day leap/month-end events with an exclusive next-day end", () => {
    const events = parse(
      calendarText([known()], "all", new Date("2026-10-02T12:34:56Z")),
    );

    expect(events).toHaveLength(2);
    const [a, b] = events.map((e) => new ICAL.Event(e));
    expect(a.startDate.isDate).toBe(true);
    expect(a.startDate.toString()).toBe("2024-02-29");
    expect(a.endDate.toString()).toBe("2024-03-01");
    expect(b.startDate.toString()).toBe("2025-02-28");
    expect(b.endDate.toString()).toBe("2025-03-01");
    expect(events[0].getFirstPropertyValue("dtstamp")?.toString()).toBe(
      "2026-10-02T12:34:56Z",
    );
  });
  it("omits unknown, none and unverified policies", () => {
    const p = known();
    p.confirmedAt = "";
    expect(parse(calendarText([p]))).toHaveLength(0);
    p.confirmedAt = "confirmed";
    p.policy.returnMode = "unknown";
    p.policy.warrantyMode = "none";
    expect(parse(calendarText([p]))).toHaveLength(0);
  });
  it("exports only the requested kind and keeps stable event identities", () => {
    const p = known();
    const first = parse(calendarText([p], "return"));
    const repeat = parse(calendarText([p], "return"));
    expect(first).toHaveLength(1);
    expect(first[0].getFirstPropertyValue("uid")).toBe(
      repeat[0].getFirstPropertyValue("uid"),
    );
    expect(parse(calendarText([p], "warranty"))).toHaveLength(1);
  });
  it("escapes injection, special characters and UTF-8 without splitting code points", () => {
    const p = known();
    p.id = "x\r\nBEGIN:VALARM";
    p.item = "Café 🍋, lamp; \\ " + "暖".repeat(70) + "\r\nBEGIN:VALARM";
    p.policy.sourceLabel = "Receipt, paper; terms\\source";
    const text = calendarText([p]);
    const events = parse(text);
    expect(new ICAL.Event(events[0]).summary).toBe(
      `Recorded return end · ${p.item.replace(/\r\n/g, "\n")}`,
    );
    expect(events[0].getAllSubcomponents("valarm")).toHaveLength(0);

    for (const line of text.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text).not.toContain("�");
  });
  it("excludes receipt, order, serial, condition notes and attachments", () => {
    const p = known();
    p.receiptText = "PRIVATE RECEIPT";
    p.notes = "PRIVATE NOTES";
    p.serialNumber = "PRIVATE SERIAL";
    p.orderNumber = "PRIVATE ORDER";
    const text = calendarText([p]);
    expect(text).not.toContain("PRIVATE RECEIPT");
    expect(text).not.toContain("PRIVATE NOTES");
    expect(text).not.toContain("PRIVATE SERIAL");
    expect(text).not.toContain("PRIVATE ORDER");
    expect(text).not.toMatch(
      /^(?:BEGIN:VALARM|ATTENDEE|ORGANIZER|METHOD|URL):?/m,
    );
  });
  it("represents the upper supported date without range overflow", () => {
    const p = known();
    p.policy.returnMode = "date";
    p.policy.returnDate = "2199-12-31";
    const event = new ICAL.Event(parse(calendarText([p], "return"))[0]);
    expect(event.startDate.toString()).toBe("2199-12-31");
    expect(event.endDate.toString()).toBe("2200-01-01");
  });
});
