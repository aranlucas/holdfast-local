import { useRef, useState } from "react";
import { ArrowRight, FileText, Upload, Sparkles } from "lucide-react";
import { Modal, Notice } from "./ui";
import { extractReceipt, readReceiptFile } from "./extraction";
import { sampleText } from "./samples";
import type { Purchase } from "./model";
export function Importer({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: (p: Purchase) => void;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function fileReady(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onReady(await readReceiptFile(file));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not read this document. Try again or paste its text.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Modal title="Give your receipt a home" onClose={onClose}>
      <p className="modal-intro">
        Drop it in. Verify three facts. Keep a plan and the proof.
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div
        className={`drop-zone ${drag ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) void fileReady(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={30} />
        <strong>
          {busy ? "Reading on your device…" : "Drop a receipt here"}
        </strong>
        <span>TXT · PDF · PNG · JPEG · WebP, up to 12 MB</span>
        <button
          className="button secondary"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          Choose a file
        </button>
        <input
          ref={input}
          type="file"
          accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
          aria-label="Receipt file"
          onChange={(e) => void fileReady(e.target.files?.[0])}
          hidden
        />
      </div>
      <div className="or">
        <span>or paste the receipt text</span>
      </div>
      <label className="field">
        <span className="sr-only">Receipt text</span>
        <textarea
          aria-label="Receipt text"
          placeholder={
            "Merchant: …\nPurchase date: YYYY-MM-DD\nItem: …\nTotal: USD …"
          }
          rows={7}
          maxLength={100000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="import-actions">
        <button
          className="text-button"
          onClick={() => {
            const p = extractReceipt(
              sampleText(),
              "Synthetic Northline receipt",
            );
            p.synthetic = true;
            onReady(p);
          }}
          disabled={busy}
        >
          <Sparkles size={16} /> Use a synthetic receipt
        </button>
        <button
          className="button primary"
          disabled={!text.trim() || busy}
          onClick={() => onReady(extractReceipt(text))}
        >
          Verify three facts <ArrowRight size={17} />
        </button>
      </div>
      <p className="quiet footnote">
        <FileText size={15} /> PDFs with a text layer are read locally. Photos
        stay as evidence; enter their facts manually. One product per timeline.
      </p>
    </Modal>
  );
}
