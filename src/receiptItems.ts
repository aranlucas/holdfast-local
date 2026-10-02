import { blankPolicy, blankPurchase } from "./model";
import type { Purchase } from "./model";

export type ReceiptItem = {
  item: string;
  amount: string;
  currency: string;
  line: number;
  excerpt: string;
  confidence: "high" | "medium";
};

// Conservative suggestions, never a list of confirmed products or allocated totals.
export function receiptItems(text: string): ReceiptItem[] {
  return text.split(/\r?\n/).flatMap((raw, i) => {
    const excerpt = raw.trim();
    const labeled = /^(item|product|description)\s*:\s*/i.test(excerpt);
    const body = excerpt.replace(/^(item|product|description)\s*:\s*/i, "");
    if (
      !labeled &&
      /^(merchant|store|date|purchase|order|receipt|total|subtotal|tax|shipping|discount|paid|amount|return|warranty|quantity|change|balance|payment)\b/i.test(
        body,
      )
    )
      return [];
    const price = body.match(
      /\s+(?:(USD|EUR|GBP|CAD|AUD)\s*|([$€£])\s*)?(\d[\d,]*\.\d{2})$/i,
    );
    if (!labeled && !price) return [];
    const item = (price ? body.slice(0, price.index) : body)
      .replace(/\s*[—–|]\s*$/, "")
      .trim();
    if (!item || !/[\p{L}]/u.test(item)) return [];
    return [
      {
        item,
        amount: price?.[3].replace(/,/g, "") || "",
        currency:
          price?.[1]?.toUpperCase() ||
          (price?.[2] === "€" ? "EUR" : price?.[2] === "£" ? "GBP" : ""),
        line: i + 1,
        excerpt,
        confidence: labeled ? ("high" as const) : ("medium" as const),
      },
    ];
  });
}

export function itemDraft(receipt: Purchase, candidate: ReceiptItem): Purchase {
  const fresh = blankPurchase();
  return {
    ...fresh,
    merchant: receipt.merchant,
    item: candidate.item,
    amount: candidate.amount,
    currency: candidate.currency || receipt.currency,
    purchaseDate: receipt.purchaseDate,
    orderNumber: receipt.orderNumber,
    receiptText: receipt.receiptText,
    sourceLabel: receipt.sourceLabel,
    synthetic: receipt.synthetic,
    attachments: [...receipt.attachments],
    evidence: {
      ...structuredClone(receipt.evidence),
      item: {
        confidence: candidate.confidence,
        excerpt: candidate.excerpt,
        line: candidate.line,
        note: "Suggested product from this receipt line. Verify the exact item.",
      },
      amount: {
        confidence: candidate.amount ? candidate.confidence : "unknown",
        excerpt: candidate.excerpt,
        line: candidate.line,
        note: candidate.amount
          ? "Line amount only. Shared taxes, shipping and discounts are not allocated. Verify currency and the amount you want to record."
          : "No line amount found. The receipt total is not copied to this product.",
      },
    },
    policy: {
      ...blankPolicy(),
      text: receipt.policy.text,
      appliesTo: candidate.item,
    },
    notes: [
      receipt.notes,
      "Part of a multi-item receipt. Each item has its own policy; shared taxes, shipping and discounts are not allocated.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
