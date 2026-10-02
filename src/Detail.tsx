import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronRight,
  File,
  FileText,
  Pencil,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import {
  CHECKLIST,
  formatDate,
  money,
  returnDeadline,
  returnStatus,
  warrantyDeadline,
} from "./model";
import type { Purchase } from "./model";
import { downloadBlob, exportPacket, packetHTML, safeName } from "./exports";
import { MAX_FILE_BYTES } from "./extraction";
import { Field, Modal, Notice } from "./ui";
export function Detail({
  p,
  onClose,
  onEdit,
  onSave,
  busy,
}: {
  p: Purchase;
  onClose: () => void;
  onEdit: () => void;
  onSave: (p: Purchase) => Promise<void>;
  busy: boolean;
}) {
  const [notes, setNotes] = useState(p.notes),
    [serial, setSerial] = useState(p.serialNumber),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ret = returnDeadline(p),
    war = warrantyDeadline(p),
    status = returnStatus(p),
    done = CHECKLIST.filter((c) => p.checklist[c.id]).length;
  async function save(next: Purchase) {
    setError("");
    try {
      await onSave({ ...next, updatedAt: new Date().toISOString() });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      return false;
    }
  }
  async function packet() {
    setExporting(true);
    setError("");
    try {
      downloadBlob(
        await exportPacket(p),
        `Holdfast-${safeName(p.item)}-proof.zip`,
      );
    } catch {
      setError(
        "Could not create this packet. Your saved purchase is unchanged; try again.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error("Evidence must be 12 MB or smaller.");
      if (p.attachments.length >= 10)
        throw new Error("Each purchase can hold up to 10 documents.");
      if (!/\.(pdf|txt|md|png|jpe?g|webp)$/i.test(file.name))
        throw new Error("Use a PDF, text, PNG, JPEG, or WebP document.");
      await save({
        ...p,
        attachments: [
          ...p.attachments,
          {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            blob: file,
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach the file.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <Modal title="Your purchase, prepared" onClose={onClose} wide>
      <div className="detail-top">
        <div>
          <p className="merchant-label">
            {p.merchant}
            {p.synthetic ? (
              <span className="sample-label">Synthetic sample</span>
            ) : null}
          </p>
          <h3>{p.item}</h3>
          <p className="quiet">
            {money(p)} <span className="dot-separator">·</span> Purchased{" "}
            {formatDate(p.purchaseDate)}
          </p>
        </div>
        <button className="button secondary" onClick={onEdit} disabled={busy}>
          <Pencil size={15} />
          Review facts
        </button>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="detail-grid">
        <div>
          <section className="timeline-panel">
            <div className="section-title">
              <CalendarDays size={19} />
              <h4>Your recorded timeline</h4>
            </div>
            <div className="milestones">
              <div className="milestone">
                <span className="milestone-dot" />
                <div>
                  <small>Purchased</small>
                  <strong>{formatDate(p.purchaseDate, true)}</strong>
                  <p>Confirmed by you · {p.sourceLabel}</p>
                </div>
              </div>
              {p.arrivalDate ? (
                <div className="milestone">
                  <span className="milestone-dot" />
                  <div>
                    <small>Delivered / received</small>
                    <strong>{formatDate(p.arrivalDate, true)}</strong>
                  </div>
                </div>
              ) : null}
              <div className={`milestone ${status.tone}`}>
                <span className="milestone-dot" />
                <div>
                  <small>Recorded return end</small>
                  <strong>
                    {ret.state === "none"
                      ? "No stated window"
                      : formatDate(ret.date, true)}
                  </strong>
                  <span className={`status ${status.tone}`}>
                    {status.label}
                  </span>
                  <p>{ret.explanation}</p>
                </div>
              </div>
              <div className="milestone">
                <span className="milestone-dot" />
                <div>
                  <small>Recorded warranty end</small>
                  <strong>
                    {war.state === "none"
                      ? "No stated warranty"
                      : formatDate(war.date, true)}
                  </strong>
                  <p>{war.explanation}</p>
                </div>
              </div>
            </div>
          </section>
          <section className="source-panel">
            <div className="section-title">
              <FileText size={19} />
              <h4>The rule behind the dates</h4>
            </div>
            <strong>
              {p.policy.sourceLabel || "Policy source not yet recorded"}
            </strong>
            <p className="quiet">Applies to: {p.policy.appliesTo || p.item}</p>
            <blockquote>
              {p.policy.text ||
                "No policy text. Review the facts when you know which rule applies to this item."}
            </blockquote>
            {p.policy.notes ? (
              <p className="footnote">{p.policy.notes}</p>
            ) : null}
            <p className="footnote">
              Verify eligibility, conditions, fees, method, and the final-day
              cutoff with the merchant. Recorded dates are planning aids; they
              do not establish entitlement.
            </p>
          </section>
          <details className="receipt-source">
            <summary>
              Original receipt text <ChevronRight size={16} />
            </summary>
            <p className="quiet">{p.sourceLabel}</p>
            <pre>
              {p.receiptText ||
                "No text extracted. The original is in Documents below."}
            </pre>
          </details>
        </div>
        <div className="proof-column">
          <section className="proof-panel">
            <div className="section-title">
              <ShieldCheck size={20} />
              <h4>Build your proof packet</h4>
            </div>
            <p className="quiet">
              A little preparation now.
              <br />
              Less searching later.
            </p>
            <div className="readiness">
              <span>
                {done} of {CHECKLIST.length} ready
              </span>
              <div>
                <i style={{ width: `${(done / CHECKLIST.length) * 100}%` }} />
              </div>
            </div>
            <div className="checklist">
              {CHECKLIST.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={!!p.checklist[c.id]}
                    disabled={busy}
                    onChange={(e) =>
                      void save({
                        ...p,
                        checklist: { ...p.checklist, [c.id]: e.target.checked },
                      })
                    }
                  />
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="button primary full"
              onClick={() => void packet()}
              disabled={busy || exporting}
            >
              <ArrowDownToLine size={17} />
              {exporting ? "Creating packet…" : "Export proof packet"}
            </button>
            <button
              className="text-button full"
              onClick={() =>
                downloadBlob(
                  new Blob([packetHTML(p)], { type: "text/html" }),
                  `Holdfast-${safeName(p.item)}-print.html`,
                )
              }
            >
              Download printable summary
            </button>
            <p className="packet-caption">
              ZIP · original files + summary + checklist
              <br />
              Downloaded to your device. You choose where it goes.
            </p>
          </section>
          <section className="documents">
            <div className="section-title">
              <Paperclip size={18} />
              <h4>Documents</h4>
              <span>{p.attachments.length}</span>
            </div>
            {p.attachments.map((a) => (
              <button
                className="document-row"
                key={a.id}
                onClick={() => downloadBlob(a.blob, a.name)}
              >
                <File size={20} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {Math.max(1, Math.round(a.size / 1024))} KB · original file
                  </small>
                </span>
                <ArrowDownToLine size={15} />
              </button>
            ))}
            {!p.attachments.length ? (
              <p className="quiet footnote">
                Pasted receipt text is included in your packet. Add photos or a
                saved policy if useful.
              </p>
            ) : null}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={15} />
              Add evidence
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
              aria-label="Evidence file"
              onChange={(e) => void attach(e.target.files?.[0])}
            />
          </section>
        </div>
      </div>
      <section className="notes-section">
        <div className="form-grid">
          <Field label="Condition / preparation notes">
            <textarea
              value={notes}
              rows={3}
              maxLength={10000}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          <div>
            <Field label="Serial number">
              <input
                value={serial}
                maxLength={200}
                onChange={(e) => {
                  setSerial(e.target.value);
                  setSaved(false);
                }}
                placeholder="Optional"
              />
            </Field>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void save({ ...p, notes, serialNumber: serial }).then((ok) => {
                  if (ok) setSaved(true);
                })
              }
            >
              {saved ? <Check size={15} /> : <Pencil size={15} />}{" "}
              {saved ? "Notes saved" : "Save notes"}
            </button>
          </div>
        </div>
        <Field label="Outcome">
          <select
            value={p.outcome}
            disabled={busy}
            onChange={(e) =>
              void save({
                ...p,
                outcome: e.target.value as Purchase["outcome"],
              })
            }
          >
            <option value="active">Still deciding / active</option>
            <option value="returned">I returned this item</option>
            <option value="kept">I am keeping this item</option>
          </select>
        </Field>
      </section>
    </Modal>
  );
}
