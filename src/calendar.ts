import { returnDeadline, warrantyDeadline } from "./model";
import type { Purchase } from "./model";

function textValue(value: string): string {
  return value
    .replaceAll("\\", String.raw`\\`)
    .replaceAll(/\r\n|\r|\n/g, String.raw`\n`)
    .replaceAll(/[,;]/g, String.raw`\$&`)
    .replaceAll(/[\u0000-\u0008\x0B-\u001F\x7F]/g, "");
}

function fold(line: string): string {
  const encoder = new TextEncoder();

  let part = "";
  let length = 0;
  let result = "";

  for (const char of line) {
    const size = encoder.encode(char).length;

    if (length + size > 75) {
      result += part + "\r\n";
      part = " ";
      length = 1;
    }

    part += char;
    length += size;
  }

  return result + part;
}

export function calendarEvents(purchases: Purchase[], kind = "all") {
  return purchases
    .filter((p) => !!p.confirmedAt)
    .flatMap((p) => [
      { p, kind: "return", deadline: returnDeadline(p) },
      { p, kind: "warranty", deadline: warrantyDeadline(p) },
    ])
    .filter(
      (e) =>
        e.deadline.state === "known" && !!e.deadline.date && (kind === "all" || e.kind === kind),
    );
}

export function calendarText(purchases: Purchase[], kind = "all", now = new Date()): string {
  const stamp = now
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Holdfast//Recorded policy dates//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const e of calendarEvents(purchases, kind)) {
    const date = e.deadline.date!;

    // DATE values are calendar days. DTEND is exclusive, including at 2199-12-31.
    const end = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

    const uid = Array.from(new TextEncoder().encode(e.p.id))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}-${e.kind}@holdfast.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${end.replaceAll("-", "")}`,
      `SUMMARY:${textValue(`Recorded ${e.kind} end · ${e.p.item}`)}`,
      `DESCRIPTION:${textValue(`${e.p.merchant}\nPolicy source: ${e.p.policy.sourceLabel || "User-recorded source"}\n${e.deadline.explanation}\nPlanning aid. Verify item eligibility, terms and final-day cutoff with the merchant. Exported dates do not update automatically.`)}`,
      "CLASS:PRIVATE",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}

export function calendarBlob(purchases: Purchase[], kind = "all"): Blob {
  return new Blob([calendarText(purchases, kind)], {
    type: "text/calendar;charset=utf-8",
  });
}
