import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
} from "lucide-react";
import type { EvidenceKey, Policy, Purchase } from "./model";
import {
  formatDate,
  returnDeadline,
  validatePurchase,
  warrantyDeadline,
} from "./model";
import { samplePolicy } from "./samples";
import { Field, Modal, Notice } from "./ui";
function EvidenceLine({ p, field }: { p: Purchase; field: EvidenceKey }) {
  const v = p.evidence[field];
  return (
    <details className="evidence">
      <summary>
        <span className={`confidence ${v.confidence}`}>
          {v.confidence === "high"
            ? "Strong match"
            : v.confidence === "medium"
              ? "Suggestion"
              : v.confidence === "confirmed"
                ? "User edited"
                : "Needs your input"}
        </span>
        <span>Source evidence</span>
        <ChevronDown size={13} />
      </summary>
      <div>
        {v.excerpt ? (
          <blockquote>
            “{v.excerpt}” {v.line ? <small>— line {v.line}</small> : null}
          </blockquote>
        ) : null}
        <p>{v.note}</p>
      </div>
    </details>
  );
}
export function Verifier({
  initial,
  onClose,
  onSave,
  busy,
  queueProgress,
}: {
  initial: Purchase;
  onClose: () => void;
  onSave: (p: Purchase) => Promise<void>;
  busy: boolean;
  queueProgress?: { current: number; total: number };
}) {
  const [p, setP] = useState(initial),
    [step, setStep] = useState(0),
    [confirmed, setConfirmed] = useState([false, false, false]),
    [errors, setErrors] = useState<string[]>([]);
  const titles = ["The purchase", "The date", "The policy"];
  function field<K extends keyof Purchase>(key: K, value: Purchase[K]) {
    setP((old) => ({
      ...old,
      [key]: value,
      ...(["merchant", "item", "purchaseDate", "amount"].includes(key)
        ? {
            evidence: {
              ...old.evidence,
              [key]: {
                ...old.evidence[key as EvidenceKey],
                confidence: "confirmed",
                note: "Edited by you. Original extraction evidence is retained.",
              },
            },
          }
        : {}),
    }));
    setConfirmed((old) => old.map((v, i) => (i >= step ? false : v)));
  }
  function policy<K extends keyof Policy>(key: K, value: Policy[K]) {
    setP((old) => ({ ...old, policy: { ...old.policy, [key]: value } }));
    setConfirmed((old) => old.map((v, i) => (i === 2 ? false : v)));
  }
  function next() {
    const all = validatePurchase(p);
    const relevant =
      step === 0
        ? all.filter((e) => /merchant|item you|amount|currency/.test(e))
        : step === 1
          ? all.filter((e) => /purchase date|delivery|Delivery/.test(e))
          : all;
    if (relevant.length) {
      setErrors(relevant);
      return;
    }
    if (!confirmed[step]) {
      setErrors(["Confirm this fact after checking the evidence."]);
      return;
    }
    setErrors([]);
    if (step < 2) setStep(step + 1);
    else
      void onSave({
        ...p,
        confirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch((e) =>
        setErrors([
          e instanceof Error ? e.message : "Could not save. Try again.",
        ]),
      );
  }
  return (
    <Modal
      title={initial.confirmedAt ? "Review your facts" : "Verify three facts"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="verify-layout">
        <aside className="verify-rail">
          <p>
            A quick human check.
            <br />A timeline you can trust.
          </p>
          <ol>
            {titles.map((title, i) => (
              <li
                key={title}
                className={step === i ? "current" : step > i ? "done" : ""}
              >
                <button
                  onClick={() => {
                    if (i <= step) {
                      setStep(i);
                      setErrors([]);
                    }
                  }}
                  disabled={i > step || busy}
                >
                  <span>{step > i ? <Check size={15} /> : i + 1}</span>
                  {title}
                </button>
              </li>
            ))}
          </ol>
          <div className="rail-source">
            <FileText size={20} />
            <strong>{p.sourceLabel}</strong>
            <span>
              {p.synthetic
                ? "Synthetic document · fictional terms"
                : "Stays on this device"}
            </span>
          </div>
        </aside>
        <section className="verify-main">
          {queueProgress ? (
            <div className="queue-progress">
              <strong>
                Item {queueProgress.current} of {queueProgress.total} · {p.item}
              </strong>
              <span>
                Saved items stay on your shelf. Closing discards this item and
                any remaining drafts.
              </span>
            </div>
          ) : null}
          <div className="step-kicker">Fact {step + 1} of 3</div>
          <h3>
            {step === 0
              ? "What did you buy?"
              : step === 1
                ? "When does the clock start?"
                : "Which rule applies to this item?"}
          </h3>
          <p className="quiet">
            {step === 0
              ? "We suggest matches. You decide what goes in the record."
              : step === 1
                ? "Calendar dates stay the same across time zones. Confirm a delivery date if the rule starts there."
                : "Keep it unknown if you have not checked. Each record has its own item-specific rule."}
          </p>
          {p.notes && !initial.confirmedAt ? <Notice>{p.notes}</Notice> : null}
          {errors.length ? (
            <Notice kind="error">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {step === 0 ? (
            <>
              <Field label="Merchant">
                <input
                  value={p.merchant}
                  maxLength={200}
                  onChange={(e) => field("merchant", e.target.value)}
                />
              </Field>
              <EvidenceLine p={p} field="merchant" />
              <Field
                label="Item you are tracking"
                hint="Track one product per record. Receipt totals may include other items."
              >
                <input
                  value={p.item}
                  maxLength={300}
                  onChange={(e) => field("item", e.target.value)}
                />
              </Field>
              <EvidenceLine p={p} field="item" />
              <div className="form-grid">
                <Field label="Amount for this item">
                  <input
                    inputMode="decimal"
                    placeholder="Optional"
                    value={p.amount}
                    maxLength={20}
                    onChange={(e) => field("amount", e.target.value)}
                  />
                </Field>
                <Field label="Currency">
                  <select
                    value={p.currency}
                    onChange={(e) => field("currency", e.target.value)}
                  >
                    {[
                      "USD",
                      "EUR",
                      "GBP",
                      "CAD",
                      "AUD",
                      "JPY",
                      "CHF",
                      "INR",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <EvidenceLine p={p} field="amount" />
              <Field label="Order / receipt number">
                <input
                  value={p.orderNumber}
                  maxLength={200}
                  onChange={(e) => field("orderNumber", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Field label="Purchase date">
                <input
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  value={p.purchaseDate}
                  onChange={(e) => field("purchaseDate", e.target.value)}
                />
              </Field>
              <EvidenceLine p={p} field="purchaseDate" />
              <Field
                label="Delivery / received date"
                hint="Optional unless a confirmed rule starts on delivery."
              >
                <input
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  value={p.arrivalDate}
                  onChange={(e) => field("arrivalDate", e.target.value)}
                />
              </Field>
              <div className="date-note">
                <CheckCircle2 size={24} />
                <p>
                  Dates are calendar days.
                  <br />
                  <span>
                    We do not infer midnight cutoffs, shipping time, holidays,
                    or store hours.
                  </span>
                </p>
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div className="policy-top">
                <Field label="Return rule">
                  <select
                    value={p.policy.returnMode}
                    onChange={(e) =>
                      policy(
                        "returnMode",
                        e.target.value as Policy["returnMode"],
                      )
                    }
                  >
                    <option value="unknown">
                      Unknown — verify with merchant
                    </option>
                    <option value="days">A number of calendar days</option>
                    <option value="date">An exact end date</option>
                    <option value="none">No stated return window</option>
                  </select>
                </Field>
                {p.synthetic ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setP((old) => ({
                        ...old,
                        policy: samplePolicy(old.item),
                      }));
                      setConfirmed((old) =>
                        old.map((v, i) => (i === 2 ? false : v)),
                      );
                    }}
                  >
                    Use fictional sample policy
                  </button>
                ) : null}
              </div>
              {p.policy.returnMode === "days" ? (
                <>
                  <div className="form-grid">
                    <Field label="Return window (days)">
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={p.policy.returnDays}
                        onChange={(e) =>
                          policy("returnDays", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field label="Return window starts on">
                      <select
                        value={p.policy.startOn}
                        onChange={(e) =>
                          policy("startOn", e.target.value as Policy["startOn"])
                        }
                      >
                        <option value="purchase">Purchase date</option>
                        <option value="arrival">Delivery date</option>
                      </select>
                    </Field>
                  </div>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={p.policy.countStart}
                      onChange={(e) => policy("countStart", e.target.checked)}
                    />
                    Count the start date as day 1{" "}
                    <span className="quiet">(otherwise day 0)</span>
                  </label>
                </>
              ) : null}
              {p.policy.returnMode === "date" ? (
                <Field label="Exact return end date">
                  <input
                    type="date"
                    min="1900-01-01"
                    max="2199-12-31"
                    value={p.policy.returnDate}
                    onChange={(e) => policy("returnDate", e.target.value)}
                  />
                </Field>
              ) : null}
              <Field label="Warranty rule">
                <select
                  value={p.policy.warrantyMode}
                  onChange={(e) =>
                    policy(
                      "warrantyMode",
                      e.target.value as Policy["warrantyMode"],
                    )
                  }
                >
                  <option value="unknown">
                    Unknown — coverage needs verification
                  </option>
                  <option value="months">A number of calendar months</option>
                  <option value="date">An exact end date</option>
                  <option value="none">No stated warranty</option>
                </select>
              </Field>
              {p.policy.warrantyMode === "months" ? (
                <div className="form-grid">
                  <Field label="Warranty term (months)">
                    <input
                      type="number"
                      min="1"
                      max="1200"
                      value={p.policy.warrantyMonths}
                      onChange={(e) =>
                        policy("warrantyMonths", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Warranty starts on">
                    <select
                      value={p.policy.warrantyStartOn}
                      onChange={(e) =>
                        policy(
                          "warrantyStartOn",
                          e.target.value as Policy["warrantyStartOn"],
                        )
                      }
                    >
                      <option value="purchase">Purchase date</option>
                      <option value="arrival">Delivery date</option>
                    </select>
                  </Field>
                </div>
              ) : null}
              {p.policy.warrantyMode === "date" ? (
                <Field label="Exact warranty end date">
                  <input
                    type="date"
                    min="1900-01-01"
                    max="2199-12-31"
                    value={p.policy.warrantyDate}
                    onChange={(e) => policy("warrantyDate", e.target.value)}
                  />
                </Field>
              ) : null}
              <Field
                label="Policy source label"
                hint="A receipt note, saved policy document, or a reference you checked. URLs remain plain text."
              >
                <input
                  value={p.policy.sourceLabel}
                  maxLength={300}
                  onChange={(e) => policy("sourceLabel", e.target.value)}
                  placeholder="e.g. Receipt policy, checked 2 Oct 2026"
                />
              </Field>
              <Field label="Applies to this item / category">
                <input
                  value={p.policy.appliesTo}
                  maxLength={300}
                  placeholder={p.item}
                  onChange={(e) => policy("appliesTo", e.target.value)}
                />
              </Field>
              <Field label="Policy text and conditions">
                <textarea
                  value={p.policy.text}
                  maxLength={100000}
                  rows={4}
                  onChange={(e) => policy("text", e.target.value)}
                  placeholder="Paste the item-specific wording; include exclusions, condition requirements, and fees."
                />
              </Field>
              <Field label="Exceptions / uncertainty">
                <textarea
                  value={p.policy.notes}
                  maxLength={10000}
                  rows={2}
                  onChange={(e) => policy("notes", e.target.value)}
                  placeholder="Optional: things to double-check"
                />
              </Field>
              <div className="calculation-preview">
                <strong>Recorded dates</strong>
                <div>
                  <span>Return</span>
                  <b>
                    {returnDeadline(p).state === "none"
                      ? "No stated window"
                      : formatDate(returnDeadline(p).date)}
                  </b>
                </div>
                <p>{returnDeadline(p).explanation}</p>
                <div>
                  <span>Warranty</span>
                  <b>
                    {warrantyDeadline(p).state === "none"
                      ? "No stated warranty"
                      : formatDate(warrantyDeadline(p).date)}
                  </b>
                </div>
                <p>{warrantyDeadline(p).explanation}</p>
              </div>
            </>
          ) : null}
          <label className="confirm-fact">
            <input
              type="checkbox"
              checked={confirmed[step]}
              onChange={(e) =>
                setConfirmed((old) =>
                  old.map((v, i) => (i === step ? e.target.checked : v)),
                )
              }
            />
            <span>
              {step === 0
                ? "I checked the merchant, item, and amount."
                : step === 1
                  ? "I checked the purchase date and any delivery date."
                  : "I checked the item-specific rule, or intentionally left it unknown."}
            </span>
          </label>
          <div className="wizard-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (step) {
                  setStep(step - 1);
                  setErrors([]);
                } else onClose();
              }}
            >
              <ArrowLeft size={16} />
              {step
                ? "Back"
                : queueProgress
                  ? "Discard remaining items"
                  : "Cancel"}
            </button>
            <button className="button primary" onClick={next} disabled={busy}>
              {busy
                ? "Saving…"
                : step === 2
                  ? "Save to my shelf"
                  : "Confirm & continue"}
              {step === 2 ? <Check size={17} /> : <ArrowRight size={17} />}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
