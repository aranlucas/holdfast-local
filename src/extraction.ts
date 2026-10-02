import { blankPurchase, isDate } from "./model";
import type { Evidence, EvidenceKey, Purchase } from "./model";
function dateCandidate(raw: string): { value: string; ambiguous: boolean } {
  const iso = raw.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso && isDate(iso[0])) return { value: iso[0], ambiguous: false };
  const named = raw.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})\b/i,
  );
  if (named) {
    const month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
    const value = `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
    if (isDate(value)) return { value, ambiguous: false };
  }
  const numeric = raw.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|19\d{2})\b/);
  if (numeric) return { value: "", ambiguous: true };
  return { value: "", ambiguous: false };
}
export function extractReceipt(
  text: string,
  label = "Pasted receipt",
): Purchase {
  const p = blankPurchase();
  p.receiptText = text.slice(0, 100000);
  p.sourceLabel = label;
  const lines = p.receiptText
    .split(/\r?\n/)
    .map((value, i) => ({ value: value.trim(), number: i + 1 }))
    .filter((l) => l.value);
  function set(
    key: EvidenceKey,
    value: string,
    line: { value: string; number: number },
    confidence: Evidence["confidence"],
    note: string,
  ) {
    p[key] = value;
    p.evidence[key] = {
      excerpt: line.value,
      line: line.number,
      confidence,
      note,
    };
  }
  const merchant = lines.find((l) =>
    /^(merchant|store|sold by)\s*:/i.test(l.value),
  );
  if (merchant)
    set(
      "merchant",
      merchant.value.replace(/^(merchant|store|sold by)\s*:\s*/i, ""),
      merchant,
      "high",
      "Explicit merchant label. Verify the seller.",
    );
  else {
    const first = lines.find(
      (l) =>
        !/(receipt|invoice|synthetic|sample|order|date|total)/i.test(l.value) &&
        /[a-z]/i.test(l.value),
    );
    if (first)
      set(
        "merchant",
        first.value,
        first,
        "medium",
        "First likely merchant line. This is a suggestion.",
      );
  }
  const item = lines.find((l) =>
    /^(item|product|description)\s*:/i.test(l.value),
  );
  if (item)
    set(
      "item",
      item.value.replace(/^(item|product|description)\s*:\s*/i, ""),
      item,
      "high",
      "Explicit item label. One product per timeline.",
    );
  else {
    const possible = lines.find(
      (l) =>
        /^.+\s+(?:\$|USD\s*)?\d+\.\d{2}$/.test(l.value) &&
        !/(total|subtotal|tax|change|paid|discount|shipping)/i.test(l.value),
    );
    if (possible)
      set(
        "item",
        possible.value.replace(/\s+(?:\$|USD\s*)?\d+\.\d{2}$/, ""),
        possible,
        "medium",
        "Likely line item. Check the exact product.",
      );
  }
  const total = lines.find((l) =>
    /^(grand total|order total|total|amount paid)\s*:?\s*(?:USD|EUR|GBP|CAD|AUD|\$|€|£)?\s*[\d,.]+\s*(?:USD|EUR|GBP|CAD|AUD)?$/i.test(
      l.value,
    ),
  );
  if (total) {
    const amount =
      total.value.match(/\d[\d,]*\.\d{2}|\d[\d,]*$/)?.[0]?.replace(/,/g, "") ||
      "";
    set(
      "amount",
      amount,
      total,
      "high",
      "Receipt total; it may include other products. Edit for this item.",
    );
    const currency = total.value.match(/\b(USD|EUR|GBP|CAD|AUD)\b/i)?.[1];
    p.currency =
      currency?.toUpperCase() ||
      (total.value.includes("€")
        ? "EUR"
        : total.value.includes("£")
          ? "GBP"
          : "USD");
    if (!currency && !total.value.includes("€") && !total.value.includes("£")) {
      p.evidence.amount.note +=
        " Currency is not explicit; USD is an editable default. Verify it.";
    }
  }
  const dateLine =
    lines.find((l) =>
      /^(purchase date|date|purchased|transaction date)\s*:/i.test(l.value),
    ) ||
    lines.find(
      (l) => dateCandidate(l.value).value || dateCandidate(l.value).ambiguous,
    );
  if (dateLine) {
    const d = dateCandidate(dateLine.value);
    if (d.value)
      set(
        "purchaseDate",
        d.value,
        dateLine,
        /^(purchase date|date|purchased|transaction date)\s*:/i.test(
          dateLine.value,
        )
          ? "high"
          : "medium",
        /^(purchase date|date|purchased|transaction date)\s*:/i.test(
          dateLine.value,
        )
          ? "Unambiguous calendar date. Verify the purchase date."
          : "First readable date; it may be an invoice or delivery date. Verify the purchase date yourself.",
      );
    else if (d.ambiguous)
      p.evidence.purchaseDate = {
        confidence: "unknown",
        excerpt: dateLine.value,
        line: dateLine.number,
        note: "Ambiguous numeric date. Choose the calendar date yourself; no format assumed.",
      };
  }
  p.orderNumber =
    lines
      .find((l) =>
        /^(order|receipt|transaction)(?: (?:number|no|id))?\s*[:#]/i.test(
          l.value,
        ),
      )
      ?.value.replace(
        /^(order|receipt|transaction)(?: (?:number|no|id))?\s*[:#]\s*/i,
        "",
      ) || "";
  const policyLines = lines.filter((l) =>
    /(return|warranty|final sale|restocking|eligib)/i.test(l.value),
  );
  p.policy.text = policyLines.map((l) => l.value).join("\n");
  p.policy.appliesTo = p.item;
  return p;
}
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export async function readReceiptFile(file: File): Promise<Purchase> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(
      "This file is larger than 12 MB. Use a smaller file or paste the receipt text.",
    );
  const name = file.name.toLowerCase();
  let text = "",
    note = "";
  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    file.type === "text/plain"
  ) {
    text = await file.text();
    if (text.length > 100000)
      throw new Error(
        "Receipt text is too long. Keep it under 100,000 characters.",
      );
  } else if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    let pdf;
    try {
      pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        useSystemFonts: true,
      }).promise;
      if (pdf.numPages > 20)
        throw new Error("Use a receipt PDF with 20 pages or fewer.");
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        let line = "";
        const lines: string[] = [];
        for (const item of content.items) {
          if ("str" in item) {
            line += item.str + " ";
            if (item.hasEOL) {
              lines.push(line.trim());
              line = "";
            }
          }
        }
        if (line.trim()) lines.push(line.trim());
        pages.push(lines.join("\n"));
      }
      text = pages.join("\n\n");
      if (text.length > 100000)
        throw new Error("Extracted text is too long. Use a smaller receipt.");
      if (!text.trim())
        note =
          "This PDF has no readable text layer. The original is kept; enter the facts manually.";
    } catch (error) {
      if (error instanceof Error && /password|encrypted/i.test(error.message))
        throw new Error(
          "This PDF is password protected. Use an unlocked copy or paste the text.",
        );
      throw new Error(
        error instanceof Error
          ? `Could not read PDF: ${error.message}`
          : "Could not read PDF. Try again or paste the text.",
      );
    } finally {
      await pdf?.destroy();
    }
  } else if (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    /\.(png|jpe?g|webp)$/.test(name)
  ) {
    note =
      "Photo saved as evidence. Image text is not extracted; enter the facts manually.";
  } else
    throw new Error(
      "Choose a TXT, PDF, PNG, JPEG, or WebP receipt. Other files are not imported.",
    );
  const p = extractReceipt(text, file.name);
  p.attachments = [
    {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      blob: file,
    },
  ];
  if (note) p.notes = note;
  return p;
}
