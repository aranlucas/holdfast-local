import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import type { Purchase } from "./model";
import { money } from "./model";
import { itemDraft, receiptItems } from "./receiptItems";
import { Modal, Notice } from "./ui";

export function ReceiptPicker({
  receipt,
  onClose,
  onReady,
}: {
  receipt: Purchase;
  onClose: () => void;
  onReady: (p: Purchase[]) => void;
}) {
  const matches = receiptItems(receipt.receiptText);
  const candidates = matches.slice(0, 100);
  const [selected, setSelected] = useState<number[]>(
    candidates.slice(0, 20).map((_, i) => i),
  );
  return (
    <Modal title="One receipt. Separate plans." onClose={onClose}>
      <p className="modal-intro">
        Choose the products to track. Then verify three facts for each—every
        item gets its own rule.
      </p>
      <Notice>
        These are suggestions from receipt lines. Line amounts exclude any
        shared taxes, shipping or discounts. The receipt total is never repeated
        across products.
      </Notice>
      {matches.length > candidates.length ? (
        <Notice>
          Showing the first 100 suggested lines. Enter other products manually.
        </Notice>
      ) : null}
      <div className="receipt-picks">
        {candidates.map((c, i) => (
          <label key={c.line} className="receipt-pick">
            <input
              type="checkbox"
              checked={selected.includes(i)}
              disabled={selected.length >= 20 && !selected.includes(i)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked ? [...old, i] : old.filter((v) => v !== i),
                )
              }
            />
            <span>
              <strong>{c.item}</strong>
              <small>
                {c.amount
                  ? money({
                      amount: c.amount,
                      currency: c.currency || receipt.currency,
                    })
                  : "Amount needs your input"}{" "}
                · {c.confidence === "high" ? "Labeled item" : "Suggested item"}
              </small>
              <code>
                Line {c.line}: {c.excerpt}
              </code>
            </span>
          </label>
        ))}
      </div>
      <p className="quiet footnote">
        <FileText size={15} /> The complete receipt and original document stay
        with each record. Track up to 20 items at a time; nothing is saved until
        you verify it.
      </p>
      <div className="wizard-actions">
        <button className="text-button" onClick={() => onReady([receipt])}>
          Track one item manually
        </button>
        <button
          className="button primary"
          disabled={!selected.length}
          onClick={() =>
            onReady(
              candidates
                .filter((_, i) => selected.includes(i))
                .map((c) => itemDraft(receipt, c)),
            )
          }
        >
          Verify {selected.length} {selected.length === 1 ? "item" : "items"}
          <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}
