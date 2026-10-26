import { CHECKLIST, formatDate, money, returnDeadline, warrantyDeadline } from "./model";
import type { Purchase } from "./model";
import JSZip from "jszip";
import { purchaseMetadata } from "./backup-schema";

export function safeName(name: string): string {
  return (
    name
      .replaceAll(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 100) || "evidence"
  );
}

const htmlEntities = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

export function escapeHTML(value: string): string {
  return value.replaceAll(/[&<>"']/g, (c) => htmlEntities.get(c) ?? c);
}

export function packetHTML(p: Purchase): string {
  const e = escapeHTML;
  const ret = returnDeadline(p);
  const war = warrantyDeadline(p);

  const fields = [
    ["Merchant", p.merchant],
    ["Item", p.item],
    ["Amount", money(p)],
    ["Purchased", formatDate(p.purchaseDate, true)],
    ["Delivered", p.arrivalDate ? formatDate(p.arrivalDate, true) : "Not recorded"],
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
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportPacket(p: Purchase): Promise<Blob> {
  const zip = new JSZip();
  zip.file("proof-packet.html", packetHTML(p));
  zip.file("purchase.json", JSON.stringify(purchaseMetadata(p), null, 2));
  zip.file("receipt.txt", p.receiptText || "No text extracted. Original attachment retained.");
  zip.file(
    "policy.txt",
    `Source: ${p.policy.sourceLabel || "Unknown"}\nApplies to: ${p.policy.appliesTo || p.item}\n\n${p.policy.text}\n\nNotes: ${p.policy.notes}`,
  );
  zip.file(
    "checklist.md",
    `# ${p.item} — preparation checklist\n\n${CHECKLIST.map((c) => `- [${p.checklist[c.id] ? "x" : " "}] ${c.title}: ${c.description}`).join("\n")}\n\nRecorded return: ${formatDate(returnDeadline(p).date)}\nRecorded warranty: ${formatDate(warrantyDeadline(p).date)}\n\nVerify the merchant's item-specific terms and final-day cutoff. This packet is a planning aid, not an entitlement decision.`,
  );

  for (const a of p.attachments) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Keep evidence reads sequential and preserve archive insertion, validation and fail-fast order.
    zip.file(`evidence/${a.id}-${safeName(a.name)}`, await a.blob.arrayBuffer());
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
