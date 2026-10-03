export type Evidence = {
  confidence: "high" | "medium" | "unknown" | "confirmed";
  excerpt: string;
  line?: number;
  note: string;
};

export type EvidenceKey = "merchant" | "item" | "purchaseDate" | "amount";

export type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type Policy = {
  returnMode: "unknown" | "days" | "date" | "none";
  returnDays: number;
  returnDate: string;
  startOn: "purchase" | "arrival";
  countStart: boolean;
  warrantyMode: "unknown" | "months" | "date" | "none";
  warrantyMonths: number;
  warrantyDate: string;
  warrantyStartOn: "purchase" | "arrival";
  sourceLabel: string;
  text: string;
  appliesTo: string;
  notes: string;
};

export type Purchase = {
  id: string;
  merchant: string;
  item: string;
  amount: string;
  currency: string;
  purchaseDate: string;
  arrivalDate: string;
  orderNumber: string;
  serialNumber: string;
  receiptText: string;
  sourceLabel: string;
  evidence: Record<EvidenceKey, Evidence>;
  policy: Policy;
  attachments: Attachment[];
  checklist: Record<string, boolean>;
  outcome: "active" | "returned" | "kept";
  notes: string;
  synthetic: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
};

export type Deadline = {
  date: string | null;
  explanation: string;
  state: "known" | "unknown" | "none";
};

export const CHECKLIST = [
  {
    id: "receipt",
    title: "Proof of purchase",
    description: "Receipt or order confirmation is in the packet.",
  },
  {
    id: "policy",
    title: "Policy and item eligibility",
    description:
      "Check the item, seller, conditions, fees, and deadline with the merchant.",
  },
  {
    id: "condition",
    title: "Condition and serial number",
    description:
      "Add condition notes, photos, or the serial number if relevant.",
  },
  {
    id: "contents",
    title: "Packaging and accessories",
    description: "Collect what the merchant asks you to include.",
  },
  {
    id: "contact",
    title: "Next step with the merchant",
    description:
      "Confirm the method, location, and any authorization you need.",
  },
] as const;

export function blankPolicy(): Policy {
  return {
    returnMode: "unknown",
    returnDays: 30,
    returnDate: "",
    startOn: "purchase",
    countStart: false,
    warrantyMode: "unknown",
    warrantyMonths: 12,
    warrantyDate: "",
    warrantyStartOn: "purchase",
    sourceLabel: "",
    text: "",
    appliesTo: "",
    notes: "",
  };
}

export function blankEvidence(): Evidence {
  return {
    confidence: "unknown",
    excerpt: "",
    note: "Not found. Enter and verify this fact.",
  };
}

export function blankPurchase(): Purchase {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    merchant: "",
    item: "",
    amount: "",
    currency: "USD",
    purchaseDate: "",
    arrivalDate: "",
    orderNumber: "",
    serialNumber: "",
    receiptText: "",
    sourceLabel: "User-entered receipt",
    evidence: {
      merchant: blankEvidence(),
      item: blankEvidence(),
      purchaseDate: blankEvidence(),
      amount: blankEvidence(),
    },
    policy: blankPolicy(),
    attachments: [],
    checklist: {},
    outcome: "active",
    notes: "",
    synthetic: false,
    createdAt: now,
    updatedAt: now,
    confirmedAt: "",
  };
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);

  if (y < 1900 || y > 2199) return false;
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function dayNumber(value: string): number {
  if (!isDate(value))
    throw new Error("Enter a valid calendar date between 1900 and 2199.");

  return Date.parse(`${value}T00:00:00Z`) / 86400000;
}

export function addDays(value: string, days: number): string {
  const date = new Date((dayNumber(value) + days) * 86400000)
    .toISOString()
    .slice(0, 10);

  if (!isDate(date))
    throw new Error("Calculated date is outside the supported range.");

  return date;
}

export function addMonths(value: string, months: number): string {
  dayNumber(value);
  const [y, m, d] = value.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();

  const date = new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);

  if (!isDate(date))
    throw new Error("Calculated date is outside the supported range.");

  return date;
}

export function todayInZone(zone?: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}

export function formatDate(date: string | null, long = false): string {
  if (!date || !isDate(date)) return "Not known";

  return new Intl.DateTimeFormat("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function returnDeadline(p: Purchase): Deadline {
  const rule = p.policy;

  if (rule.returnMode === "unknown")
    return {
      date: null,
      state: "unknown",
      explanation:
        "No confirmed return rule. Check the item-specific policy with the merchant.",
    };

  if (rule.returnMode === "none")
    return {
      date: null,
      state: "none",
      explanation:
        "You recorded that the stated policy does not offer a return window for this item.",
    };

  if (rule.returnMode === "date")
    return isDate(rule.returnDate)
      ? {
          date: rule.returnDate,
          state: "known",
          explanation: `Exact date you confirmed from ${rule.sourceLabel || "your policy source"}.`,
        }
      : {
          date: null,
          state: "unknown",
          explanation: "The exact return date is missing or invalid.",
        };
  const start = rule.startOn === "purchase" ? p.purchaseDate : p.arrivalDate;

  if (!isDate(start))
    return {
      date: null,
      state: "unknown",
      explanation: `The ${rule.startOn === "purchase" ? "purchase" : "delivery"} date is missing. No deadline calculated.`,
    };

  if (
    !Number.isInteger(rule.returnDays) ||
    rule.returnDays < 1 ||
    rule.returnDays > 3650
  )
    return {
      date: null,
      state: "unknown",
      explanation: "A valid day window is missing.",
    };

  try {
    return {
      date: addDays(start, rule.returnDays - (rule.countStart ? 1 : 0)),
      state: "known",
      explanation: `${formatDate(start)} + ${rule.returnDays} calendar days${rule.countStart ? " (start date is day 1)" : " (start date is day 0)"}. Based on your confirmed item-specific rule.`,
    };
  } catch {
    return {
      date: null,
      state: "unknown",
      explanation:
        "The calculated date is outside the supported calendar range.",
    };
  }
}

export function warrantyDeadline(p: Purchase): Deadline {
  const rule = p.policy;

  if (rule.warrantyMode === "unknown")
    return {
      date: null,
      state: "unknown",
      explanation:
        "No confirmed warranty duration. Coverage and conditions need verification.",
    };

  if (rule.warrantyMode === "none")
    return {
      date: null,
      state: "none",
      explanation: "You recorded no stated warranty for this item.",
    };

  if (rule.warrantyMode === "date")
    return isDate(rule.warrantyDate)
      ? {
          date: rule.warrantyDate,
          state: "known",
          explanation: `Exact warranty date you confirmed from ${rule.sourceLabel || "your policy source"}.`,
        }
      : {
          date: null,
          state: "unknown",
          explanation: "The exact warranty date is missing or invalid.",
        };

  const start =
    rule.warrantyStartOn === "purchase" ? p.purchaseDate : p.arrivalDate;

  if (!isDate(start))
    return {
      date: null,
      state: "unknown",
      explanation: `The ${rule.warrantyStartOn === "purchase" ? "purchase" : "delivery"} date is missing.`,
    };

  if (
    !Number.isInteger(rule.warrantyMonths) ||
    rule.warrantyMonths < 1 ||
    rule.warrantyMonths > 1200
  )
    return {
      date: null,
      state: "unknown",
      explanation: "A valid month duration is missing.",
    };

  try {
    return {
      date: addMonths(start, rule.warrantyMonths),
      state: "known",
      explanation: `${formatDate(start)} + ${rule.warrantyMonths} calendar months. Month-end dates clamp to the last day. Confirm whether the final day is covered.`,
    };
  } catch {
    return {
      date: null,
      state: "unknown",
      explanation:
        "The calculated warranty date is outside the supported calendar range.",
    };
  }
}

export function daysLeft(
  date: string | null,
  today = todayInZone(),
): number | null {
  return date ? dayNumber(date) - dayNumber(today) : null;
}

type ReturnStatus = { label: string; tone: string; key: string };

export function returnStatus(p: Purchase, today = todayInZone()): ReturnStatus {
  if (p.outcome !== "active")
    return {
      label: p.outcome === "returned" ? "Returned" : "Kept",
      tone: "muted",
      key: "closed",
    };

  const deadline = returnDeadline(p),
    left = daysLeft(deadline.date, today);

  if (deadline.state === "none")
    return { label: "No stated window", tone: "muted", key: "unknown" };

  if (left === null)
    return { label: "Policy needed", tone: "unknown", key: "unknown" };

  if (left < 0)
    return { label: "Recorded date passed", tone: "muted", key: "passed" };

  if (left === 0)
    return { label: "Recorded date is today", tone: "urgent", key: "soon" };

  return {
    label: left === 1 ? "1 day left" : `${left} days left`,
    tone: left <= 7 ? "urgent" : "open",
    key: left <= 7 ? "soon" : "open",
  };
}

export function money(p: Pick<Purchase, "amount" | "currency">): string {
  if (!p.amount) return "Amount not entered";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.currency,
    }).format(Number(p.amount));
  } catch {
    return `${p.currency} ${p.amount}`;
  }
}

export function validatePurchase(p: Purchase): string[] {
  const errors: string[] = [];

  if (!p.merchant.trim()) errors.push("Enter the merchant.");

  if (!p.item.trim()) errors.push("Enter the item you are tracking.");

  if (!isDate(p.purchaseDate))
    errors.push("Enter a valid purchase date between 1900 and 2199.");

  if (p.arrivalDate && !isDate(p.arrivalDate))
    errors.push("Enter a valid delivery date.");

  if (
    isDate(p.purchaseDate) &&
    isDate(p.arrivalDate) &&
    p.arrivalDate < p.purchaseDate
  )
    errors.push("Delivery cannot be before the purchase.");

  if (
    p.amount !== "" &&
    (!/^\d+(\.\d{1,2})?$/.test(p.amount) || Number(p.amount) > 1e9)
  )
    errors.push("Enter a valid amount with at most two decimal places.");

  if (!/^[A-Z]{3}$/.test(p.currency))
    errors.push("Choose a three-letter currency code.");
  const q = p.policy;

  if (
    (q.returnMode === "days" || q.warrantyMode === "months") &&
    ((q.returnMode === "days" && q.startOn === "arrival") ||
      (q.warrantyMode === "months" && q.warrantyStartOn === "arrival")) &&
    !isDate(p.arrivalDate)
  )
    errors.push(
      "Enter the delivery date used by your rule, or choose a purchase-date rule.",
    );

  if (
    q.returnMode === "days" &&
    (!Number.isInteger(q.returnDays) || q.returnDays < 1 || q.returnDays > 3650)
  )
    errors.push("Return days must be a whole number from 1 to 3650.");

  if (
    q.warrantyMode === "months" &&
    (!Number.isInteger(q.warrantyMonths) ||
      q.warrantyMonths < 1 ||
      q.warrantyMonths > 1200)
  )
    errors.push("Warranty months must be a whole number from 1 to 1200.");

  if (q.returnMode === "date" && !isDate(q.returnDate))
    errors.push("Enter the exact return date.");

  if (q.warrantyMode === "date" && !isDate(q.warrantyDate))
    errors.push("Enter the exact warranty date.");

  if (
    (q.returnMode !== "unknown" || q.warrantyMode !== "unknown") &&
    !q.sourceLabel.trim()
  )
    errors.push("Give the policy a source label so its origin stays visible.");

  if (
    (q.returnMode !== "unknown" || q.warrantyMode !== "unknown") &&
    !q.appliesTo.trim()
  )
    errors.push("State which item this policy applies to.");

  if (
    (q.returnMode === "date" &&
      isDate(q.returnDate) &&
      q.returnDate < p.purchaseDate) ||
    (q.warrantyMode === "date" &&
      isDate(q.warrantyDate) &&
      q.warrantyDate < p.purchaseDate)
  )
    errors.push("A policy end date cannot be before the purchase date.");

  if (
    q.returnMode === "days" &&
    returnDeadline(p).state === "unknown" &&
    isDate(q.startOn === "purchase" ? p.purchaseDate : p.arrivalDate)
  )
    errors.push("The return date is outside the supported range.");

  if (
    q.warrantyMode === "months" &&
    warrantyDeadline(p).state === "unknown" &&
    isDate(q.warrantyStartOn === "purchase" ? p.purchaseDate : p.arrivalDate)
  )
    errors.push("The warranty date is outside the supported range.");

  return errors;
}
