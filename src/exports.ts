import { z } from "zod";
import {
  CHECKLIST,
  formatDate,
  money,
  returnDeadline,
  warrantyDeadline,
  validatePurchase,
} from "./model";
import type { Purchase, Attachment } from "./model";
import JSZip from "jszip";

export function safeName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 100) || "evidence"
  );
}

export function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function serializable(p: Purchase) {
  return { ...p, attachments: p.attachments.map(({ blob: _, ...a }) => a) };
}

export function packetHTML(p: Purchase): string {
  const e = escapeHTML,
    ret = returnDeadline(p),
    war = warrantyDeadline(p);

  const fields = [
    ["Merchant", p.merchant],
    ["Item", p.item],
    ["Amount", money(p)],
    ["Purchased", formatDate(p.purchaseDate, true)],
    [
      "Delivered",
      p.arrivalDate ? formatDate(p.arrivalDate, true) : "Not recorded",
    ],
    ["Order / receipt number", p.orderNumber || "Not recorded"],
    ["Serial number", p.serialNumber || "Not recorded"],
  ];

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Holdfast proof packet · ${e(p.item)}</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#203b34;max-width:850px;margin:48px auto;padding:0 24px}h1{font-size:36px;line-height:1.15}h2{border-top:1px solid #ccd5ce;padding-top:24px;margin-top:32px}dl{display:grid;grid-template-columns:180px 1fr}dt{color:#536960}dd{margin:0 0 10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,monospace;background:#f3f5ef;padding:20px}li{margin:10px 0}.notice{background:#edf2da;padding:18px}small{color:#536960}@media print{body{margin:0;font-size:11pt}h2{break-after:avoid}pre{break-inside:auto}}</style></head><body><small>HOLDFAST / PROOF PACKET${p.synthetic ? " / SYNTHETIC DEMO" : ""}</small><h1>${e(p.item)}</h1><p>${e(p.merchant)} · ${e(money(p))}</p><p class="notice">User-organized evidence and recorded policy dates. These dates are planning aids, not a decision about eligibility or legal entitlement. Verify the applicable terms, final-day cutoff, method, condition, and fees with the merchant.</p><h2>Purchase facts</h2><dl>${fields.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl><p>Facts confirmed: ${e(p.confirmedAt || "Not confirmed")}<br>Last updated: ${e(p.updatedAt)}</p><h2>Recorded timeline</h2><p><strong>Return: ${e(ret.state === "none" ? "No stated window" : formatDate(ret.date, true))}</strong><br>${e(ret.explanation)}</p><p><strong>Warranty: ${e(war.state === "none" ? "No stated warranty" : formatDate(war.date, true))}</strong><br>${e(war.explanation)}</p><h2>Policy source</h2><p>${e(p.policy.sourceLabel || "Unknown")}<br>Applies to: ${e(p.policy.appliesTo || p.item)}</p><pre>${e(p.policy.text || "No policy text recorded.")}</pre><p>${e(p.policy.notes)}</p><h2>Preparation checklist</h2><ul>${CHECKLIST.map((c) => `<li>${p.checklist[c.id] ? "☑" : "☐"} <strong>${e(c.title)}</strong> — ${e(c.description)}</li>`).join("")}</ul><h2>Condition / notes</h2><p>${e(p.notes || "No notes recorded.")}</p><h2>Receipt source</h2><p>${e(p.sourceLabel)}</p><pre>${e(p.receiptText || "No receipt text. See original attachments in the evidence folder.")}</pre><h2>Extraction evidence</h2>${Object.entries(
    p.evidence,
  )
    .map(
      ([k, v]) =>
        `<p><strong>${e(k)}</strong>: ${e(v.confidence)}${v.line ? `, line ${v.line}` : ""}<br>${e(v.excerpt)}<br><small>${e(v.note)}</small></p>`,
    )
    .join(
      "",
    )}<h2>Original documents</h2><ul>${p.attachments.map((a) => `<li>${e(a.name)} (${a.size} bytes)</li>`).join("") || "<li>No original attachments. Pasted receipt text is included.</li>"}</ul><p><small>Keep the original files. Exporting this packet does not send it to a merchant. Outcome recorded: ${e(p.outcome)}.</small></p></body></html>`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportPacket(p: Purchase): Promise<Blob> {
  const zip = new JSZip();
  zip.file("proof-packet.html", packetHTML(p));
  zip.file("purchase.json", JSON.stringify(serializable(p), null, 2));
  zip.file(
    "receipt.txt",
    p.receiptText || "No text extracted. Original attachment retained.",
  );
  zip.file(
    "policy.txt",
    `Source: ${p.policy.sourceLabel || "Unknown"}\nApplies to: ${p.policy.appliesTo || p.item}\n\n${p.policy.text}\n\nNotes: ${p.policy.notes}`,
  );
  zip.file(
    "checklist.md",
    `# ${p.item} — preparation checklist\n\n${CHECKLIST.map((c) => `- [${p.checklist[c.id] ? "x" : " "}] ${c.title}: ${c.description}`).join("\n")}\n\nRecorded return: ${formatDate(returnDeadline(p).date)}\nRecorded warranty: ${formatDate(warrantyDeadline(p).date)}\n\nVerify the merchant's item-specific terms and final-day cutoff. This packet is a planning aid, not an entitlement decision.`,
  );

  for (const a of p.attachments)
    zip.file(
      `evidence/${a.id}-${safeName(a.name)}`,
      await a.blob.arrayBuffer(),
    );

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function exportBackup(purchases: Purchase[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "holdfast.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        purchases: purchases.map(serializable),
      },
      null,
      2,
    ),
  );

  for (const p of purchases)
    for (const a of p.attachments)
      zip.file(`evidence/${p.id}/${a.id}`, await a.blob.arrayBuffer());

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

const backupText = z.string().max(100000);

const backupId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);

const evidence = z
  .object({
    confidence: z.enum(["high", "medium", "unknown", "confirmed"]),
    excerpt: backupText,
    note: backupText,
    line: z.number().int().min(1).optional(),
  })
  .passthrough();

const backupRecord = z
  .object({
    id: backupId,
    merchant: backupText,
    item: backupText,
    amount: backupText,
    currency: backupText,
    purchaseDate: backupText,
    arrivalDate: backupText,
    orderNumber: backupText,
    serialNumber: backupText,
    receiptText: backupText,
    sourceLabel: backupText,
    notes: backupText,
    createdAt: backupText,
    updatedAt: backupText,
    confirmedAt: backupText,
    outcome: z.enum(["active", "returned", "kept"]),
    synthetic: z.boolean(),
    policy: z
      .object({
        returnMode: z.enum(["unknown", "days", "date", "none"]),
        warrantyMode: z.enum(["unknown", "months", "date", "none"]),
        startOn: z.enum(["purchase", "arrival"]),
        warrantyStartOn: z.enum(["purchase", "arrival"]),
        countStart: z.boolean(),
        returnDays: z.number(),
        warrantyMonths: z.number(),
        returnDate: backupText,
        warrantyDate: backupText,
        sourceLabel: backupText,
        text: backupText,
        appliesTo: backupText,
        notes: backupText,
      })
      .passthrough(),
    evidence: z
      .object({
        merchant: evidence,
        item: evidence,
        amount: evidence,
        purchaseDate: evidence,
      })
      .passthrough(),
    checklist: z.record(
      z.string().refine((key) => CHECKLIST.some((item) => item.id === key)),
      z.boolean(),
    ),
    attachments: z
      .array(
        z
          .object({
            id: backupId,
            name: z.string().max(200),
            type: z.string().max(100),
            size: z
              .number()
              .int()
              .min(0)
              .max(12 * 1024 * 1024),
          })
          .passthrough(),
      )
      .max(10),
  })
  .passthrough()
  .superRefine((record, context) => {
    if (
      new Set(record.attachments.map((item) => item.id)).size !==
      record.attachments.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Duplicate attachment IDs in backup.",
      });
    }

    // Purchase validation uses purchase facts and policy; blobs are reconstructed from the ZIP only after metadata validation.
    const errors = validatePurchase({ ...record, attachments: [] });

    if (errors.length)
      context.addIssue({
        code: "custom",
        message: `Backup purchase is invalid: ${errors[0]}`,
      });
  });

// Zod owns the untrusted-input boundary and preserves the precise parsed return contract.
export const validateBackupRecord = backupRecord.parse;

const backupManifest = z.object({
  schemaVersion: z.literal(1),
  purchases: z.array(backupRecord).max(500),
});

const zipMetadata = z.object({
  _data: z.object({ uncompressedSize: z.number().int().nonnegative() }),
});

export async function importBackup(file: File): Promise<Purchase[]> {
  if (file.size > 60 * 1024 * 1024)
    throw new Error("Backup is larger than 60 MB.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = zip.file("holdfast.json");

  if (!manifest) throw new Error("This is not a Holdfast backup ZIP.");

  const manifestSize = zipMetadata.parse(manifest)._data.uncompressedSize;

  if (manifestSize > 5 * 1024 * 1024)
    throw new Error("Backup manifest is too large.");
  const data = backupManifest.parse(JSON.parse(await manifest.async("string")));
  const records = data.purchases;

  if (new Set(records.map((p) => p.id)).size !== records.length)
    throw new Error("Duplicate purchase IDs in backup.");
  let total = 0;
  const result: Purchase[] = [];

  for (const p of records) {
    const attachments: Attachment[] = [];

    for (const a of p.attachments) {
      const entry = zip.file(`evidence/${p.id}/${a.id}`);

      if (!entry) throw new Error(`Missing evidence: ${a.name}`);

      const size = zipMetadata.parse(entry)._data.uncompressedSize;

      total += size;

      if (
        size !== a.size ||
        size > 12 * 1024 * 1024 ||
        total > 60 * 1024 * 1024
      )
        throw new Error("Backup evidence size is invalid or too large.");
      const buffer = await entry.async("arraybuffer");
      attachments.push({ ...a, blob: new Blob([buffer], { type: a.type }) });
    }

    result.push({ ...p, attachments });
  }

  return result;
}
