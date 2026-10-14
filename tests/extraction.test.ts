import { expect, it } from "vitest";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { pdfPageText } from "../src/extraction";

function textItem(str: string, hasEOL = false): TextItem {
  return {
    str,
    hasEOL,
    dir: "ltr",
    width: 10,
    height: 12,
    transform: [1, 0, 0, 1, 0, 0],
    fontName: "fixture",
  };
}

it("preserves PDF item order, explicit newlines and final unterminated text", () => {
  expect(
    pdfPageText([
      textItem("Merchant:"),
      textItem("Test shop", true),
      textItem("Item: Lamp", true),
      textItem("Total: $12.00"),
    ]),
  ).toBe("Merchant: Test shop\nItem: Lamp\nTotal: $12.00");
});

it("ignores marked-content boundaries without losing receipt text", () => {
  expect(
    pdfPageText([
      { type: "beginMarkedContent", id: "fixture" },
      textItem("Receipt"),
      { type: "endMarkedContent", id: "fixture" },
      textItem("evidence", true),
    ]),
  ).toBe("Receipt evidence");
});

it("keeps explicit empty lines but discards trailing whitespace-only text", () => {
  expect(pdfPageText([textItem("", true), textItem("  ")])).toBe("");
  expect(pdfPageText([textItem("A", true), textItem("", true), textItem("B")])).toBe("A\n\nB");
});
