import { addDays, blankPolicy, todayInZone } from "./model";
import type { Purchase } from "./model";
import { extractReceipt } from "./extraction";
export function sampleText(today = todayInZone()): string {
  return `SYNTHETIC SAMPLE RECEIPT — not a real purchase\nMerchant: Northline Audio\nPurchase date: ${addDays(today, -25)}\nOrder: DEMO-1048\nItem: Studio wireless headphones\nSubtotal: USD 179.00\nTax: USD 14.32\nTotal: USD 193.32\nSAMPLE RETURN POLICY: This specific headphone item can be requested for return within 30 calendar days after purchase (purchase date is day 0). Original contents required; condition and fees must be checked.\nSAMPLE WARRANTY: 12 calendar months from purchase for this item; coverage is subject to the sample terms.\nAll merchant names, documents, and terms in this demo are fictional.`;
}
export function samplePolicy(item = "Studio wireless headphones") {
  return {
    ...blankPolicy(),
    returnMode: "days" as const,
    returnDays: 30,
    warrantyMode: "months" as const,
    warrantyMonths: 12,
    sourceLabel: "Fictional Northline Audio sample policy",
    appliesTo: item,
    text: "Synthetic policy for this item only: 30 calendar days after purchase, purchase date is day 0. Original contents required. Stated warranty term: 12 calendar months from purchase. This is not a real merchant policy.",
    notes:
      "Check condition, fees, exclusions, and the final-day cutoff with the merchant.",
  };
}
export function demoPurchases(today = todayInZone()): Purchase[] {
  const headphones = extractReceipt(
    sampleText(today),
    "Synthetic Northline receipt",
  );
  headphones.policy = samplePolicy();
  headphones.synthetic = true;
  headphones.checklist = { receipt: true };
  const lamp = extractReceipt(
    `SYNTHETIC RECEIPT\nMerchant: Form & Field\nPurchase date: ${addDays(today, -9)}\nOrder: DEMO-2082\nItem: Arc desk lamp\nTotal: USD 86.00`,
    "Synthetic Form & Field receipt",
  );
  lamp.policy = {
    ...samplePolicy("Arc desk lamp"),
    returnDays: 45,
    warrantyMonths: 24,
    sourceLabel: "Fictional Form & Field lamp policy",
    text: "Synthetic item-specific policy: 45 days after purchase (day 0). 24-month warranty term from purchase. Check conditions and fees.",
  };
  lamp.synthetic = true;
  lamp.checklist = { receipt: true, contents: true };
  const shoes = extractReceipt(
    `SYNTHETIC RECEIPT\nMerchant: Milemarker\nPurchase date: ${addDays(today, -4)}\nItem: Everyday trail shoes\nTotal: USD 124.00`,
    "Synthetic Milemarker receipt",
  );
  shoes.synthetic = true;
  shoes.notes =
    "The receipt did not include a policy. Ask the seller which rule applies to this item.";
  shoes.checklist = { receipt: true };
  const kettle = extractReceipt(
    `SYNTHETIC RECEIPT\nMerchant: Good Morning Goods\nPurchase date: ${addDays(today, -50)}\nItem: Pour-over kettle\nTotal: USD 72.00`,
    "Synthetic Good Morning receipt",
  );
  kettle.policy = {
    ...samplePolicy("Pour-over kettle"),
    returnDays: 30,
    sourceLabel: "Fictional Good Morning kettle policy",
    text: "Synthetic item-specific policy: 30 days after purchase (day 0). 12-month warranty term from purchase. Check coverage and conditions.",
  };
  kettle.synthetic = true;
  kettle.checklist = { receipt: true, policy: true };
  return [headphones, lamp, shoes, kettle].map((p) => ({
    ...p,
    confirmedAt: new Date().toISOString(),
  }));
}
