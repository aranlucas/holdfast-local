import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Headphones,
  LampDesk,
  Leaf,
  LockKeyhole,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  WifiOff,
} from "lucide-react";
import { Detail } from "./detail";
import { Importer } from "./importer";
import { Privacy } from "./privacy";
import { Timeline } from "./timeline";
import { Verifier } from "./verifier";
import { Notice } from "./ui";
import {
  daysLeft,
  formatDate,
  money,
  returnDeadline,
  returnStatus,
  todayInZone,
  warrantyDeadline,
} from "./model";
import type { Purchase } from "./model";
import { demoPurchases } from "./samples";
import { clearPurchases, loadPurchases, saveMany, savePurchase } from "./storage";
import { readReceiptFile } from "./extraction";
import { ReceiptPicker } from "./receipt-picker";
import { receiptItems } from "./receipt-items";

function ItemIcon({ item }: ItemIconProps) {
  return /headphone/i.test(item) ? (
    <Headphones size={25} strokeWidth={1.4} />
  ) : /lamp/i.test(item) ? (
    <LampDesk size={25} strokeWidth={1.4} />
  ) : /shoe/i.test(item) ? (
    <Leaf size={25} strokeWidth={1.4} />
  ) : (
    <Package size={25} strokeWidth={1.4} />
  );
}

function ReceiptArt() {
  return (
    <div className="receipt-art" aria-hidden="true">
      <div className="receipt-shadow" />
      <div className="paper-slip">
        <div className="paper-brand">
          <ShieldCheck size={24} />
          <span>
            ONE LESS THING
            <br />
            TO WORRY ABOUT
          </span>
        </div>
        <div className="paper-dash" />
        <div className="paper-line">
          <span>Purchase</span>
          <i />
        </div>
        <div className="paper-line">
          <span>Policy</span>
          <i />
        </div>
        <div className="paper-line">
          <span>Proof</span>
          <i />
        </div>
        <div className="paper-dash" />
        <div className="paper-total">
          <span>Peace of mind</span>
          <strong>✓</strong>
        </div>
        <div className="paper-barcode" />
      </div>
      <span className="art-seal">
        <CheckStamp />
      </span>
    </div>
  );
}

function CheckStamp() {
  return (
    <svg width="37" height="37" viewBox="0 0 37 37" fill="none">
      <path
        d="m9 19 6 6 13-14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [page, setPage] = useState("shelf");
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<Purchase | null>(null);
  const [receipt, setReceipt] = useState<Purchase | null>(null);
  const [queue, setQueue] = useState<Purchase[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [drag, setDrag] = useState(false);

  const busyRef = useRef(false);
  const importSequence = useRef(0);

  const [today, setToday] = useState(todayInZone);
  useEffect(() => {
    const refresh = () => setToday(todayInZone());
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  async function load() {
    setError("");

    try {
      setPurchases(await loadPurchases());
      setLoaded(true);
    } catch {
      setError(
        "Device storage is unavailable. Your saved cabinet could not be loaded. Retry, or allow browser storage for this address.",
      );
    }
  }

  useEffect(() => {
    loadPurchases()
      .then((loadedPurchases) => {
        setPurchases(loadedPurchases);

        return setLoaded(true);
      })
      .catch(() =>
        setError(
          "Device storage is unavailable. Your saved cabinet could not be loaded. Retry, or allow browser storage for this address.",
        ),
      );
    const net = () => setOnline(navigator.onLine);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);

    return () => {
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => setOfflineReady(true))
        .catch(() => setOfflineReady(false));
    }
  }, []);
  useEffect((): void | (() => void) => {
    if (!toast) {
      return;
    }

    const timer = setTimeout(() => setToast(""), 5000);

    return () => clearTimeout(timer);
  }, [toast]);

  async function save(p: Purchase) {
    if (busyRef.current) {
      throw new Error("A save is still in progress. Try again in a moment.");
    }

    busyRef.current = true;
    const previous = purchases;
    setBusy(true);
    setPurchases((old) => [p, ...old.filter((x) => x.id !== p.id)]);

    try {
      await savePurchase(p);
      setError("");
    } catch {
      setPurchases(previous);
      throw new Error(
        "Could not save on this device. Check browser storage or free space, then try again. Your draft is still here.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveDraft(p: Purchase) {
    await save(p);
    setSelected(p.id);
    setDraft(queue[0] || null);
    setQueue(queue.slice(1));
    setToast(
      queue.length
        ? `${p.item} saved. Verify the next item’s own facts.`
        : "Three facts confirmed. Your purchase is saved.",
    );

    if (!queue.length) {
      setQueueTotal(0);
    }
  }

  function startDrafts(items: Purchase[]) {
    setReceipt(null);
    setImporting(false);
    setDraft(items[0] || null);
    setQueue(items.slice(1));
    setQueueTotal(items.length > 1 ? items.length : 0);
  }

  function receiveReceipt(p: Purchase) {
    setImporting(false);

    if (receiptItems(p.receiptText).length > 1) {
      setReceipt(p);
    } else {
      startDrafts([p]);
    }
  }

  function cancelDrafts() {
    if (busyRef.current) {
      return;
    }

    setDraft(null);
    setQueue([]);
    setQueueTotal(0);

    if (queueTotal) {
      setToast("Unsaved items discarded. Already verified items stay on your shelf.");
    }
  }

  async function demo() {
    setBusy(true);

    try {
      const p = demoPurchases();
      await saveMany(p);
      setPurchases((old) => [...p, ...old]);
      setToast("Four fictional purchases added. Every document and policy is synthetic.");
    } catch {
      setError("Could not save samples. Check device storage and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function drop(file?: File) {
    if (!file || busy) {
      return;
    }

    const sequence = ++importSequence.current;
    setBusy(true);
    setError("");

    try {
      const p = await readReceiptFile(file);

      if (sequence === importSequence.current) {
        receiveReceipt(p);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this receipt. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(p: Purchase[]) {
    setBusy(true);

    try {
      await saveMany(p);
      setPurchases(await loadPurchases());
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);

    try {
      await clearPurchases();
      setPurchases([]);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  const soon = purchases.filter((p) => returnStatus(p, today).key === "soon");

  const unknown = purchases.filter(
    (p) => returnStatus(p, today).key === "unknown" && p.outcome === "active",
  );

  const visible = purchases
    .filter(
      (p) =>
        (filter === "all" || returnStatus(p, today).key === filter) &&
        `${p.item} ${p.merchant} ${p.orderNumber}`.toLowerCase().includes(search.toLowerCase()),
    )
    // oxlint-disable-next-line unicorn/no-array-sort -- Sort only this newly filtered or mapped array; the browser target remains ES2022.
    .sort((a, b) => {
      const da = returnDeadline(a).date;
      const db = returnDeadline(b).date;

      return (da ?? "9999").localeCompare(db ?? "9999");
    });

  const spotlightEntry = soon
    .flatMap((purchase) => {
      const date = returnDeadline(purchase).date;
      const left = daysLeft(date, today);

      return date && left !== null ? [{ purchase, date, left }] : [];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- Sort only this newly filtered or mapped array; the browser target remains ES2022.
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const spotlight = spotlightEntry?.purchase;

  const detail = purchases.find((p) => p.id === selected);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => setPage("shelf")}>
          <img src="/icon.svg" width="36" height="36" alt="" />
          <span>
            holdfast<span className="brand-period">.</span>
          </span>
        </button>
        <div className="nav-caption">LIFE AFTER CHECKOUT</div>
        <nav aria-label="Main navigation">
          <button
            type="button"
            className={page === "shelf" ? "active" : ""}
            aria-current={page === "shelf" ? "page" : undefined}
            onClick={() => setPage("shelf")}
          >
            <Package size={18} />
            My shelf <span>{purchases.length}</span>
          </button>
          <button
            type="button"
            className={page === "timeline" ? "active" : ""}
            aria-current={page === "timeline" ? "page" : undefined}
            onClick={() => setPage("timeline")}
          >
            <CalendarDays size={18} />
            Timeline{soon.length ? <i /> : null}
          </button>
          <button
            type="button"
            className={page === "privacy" ? "active" : ""}
            aria-current={page === "privacy" ? "page" : undefined}
            onClick={() => setPage("privacy")}
          >
            <LockKeyhole size={18} />
            My device
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="tiny-receipt">
            <FileLines />
          </div>
          <p>
            Keep the proof.
            <br />
            <strong>Lose the paper pile.</strong>
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="local-icon">
            <LockKeyhole size={17} />
          </span>
          <div>
            <strong>Only on this device</strong>
            <small>
              {!online ? (
                <>
                  <WifiOff size={12} />
                  You’re offline
                </>
              ) : offlineReady ? (
                "Ready to work offline"
              ) : (
                "Private local cabinet"
              )}
            </small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <p>
            {page === "shelf" ? "My shelf" : page === "timeline" ? "Timeline" : "My device"}{" "}
            <span>/</span> {formatDate(today)}
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => setImporting(true)}
            disabled={!loaded || busy}
          >
            <Plus size={17} />
            Add receipt
          </button>
        </header>
        <main id="main" tabIndex={-1}>
          {error ? (
            <div className="app-error">
              <Notice kind="error">{error}</Notice>
              {!loaded ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    load().catch(() => setError("Device storage could not be loaded. Try again."));
                  }}
                >
                  Retry device storage
                </button>
              ) : (
                <button type="button" className="text-button" onClick={() => setError("")}>
                  Dismiss
                </button>
              )}
            </div>
          ) : null}
          {!loaded && !error ? (
            <div className="empty-results">
              <p>Opening your local cabinet…</p>
            </div>
          ) : null}
          {page === "shelf" && loaded ? (
            <>
              <section className="shelf-hero">
                <div>
                  <h1>
                    A little less
                    <br />
                    <em>“where’s that receipt?”</em>
                  </h1>
                  <p>
                    Everything you need for life after checkout.
                    <br />
                    The dates, the details, and the proof.
                  </p>
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => setImporting(true)}
                      disabled={busy}
                    >
                      <Upload size={17} />
                      Give a receipt a home <ArrowRight size={17} />
                    </button>
                    {!purchases.length ? (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => void demo()}
                      >
                        <Sparkles size={16} />
                        Try a sample shelf
                      </button>
                    ) : null}
                  </div>
                </div>
                <ReceiptArt />
              </section>
              {spotlight ? (
                <button
                  type="button"
                  className="spotlight"
                  onClick={() => setSelected(spotlight.id)}
                >
                  <span className="spotlight-calendar">
                    <CalendarDays size={23} />
                  </span>
                  <span>
                    <strong>A good time to decide.</strong>
                    <span>
                      {spotlight.item} · your recorded return date is{" "}
                      {spotlightEntry?.left === 0
                        ? "today"
                        : `in ${spotlightEntry?.left ?? 0} days`}
                      .
                    </span>
                  </span>
                  <span className="spotlight-action">
                    Get the proof ready <ArrowRight size={17} />
                  </span>
                </button>
              ) : purchases.length && unknown.length ? (
                <button
                  type="button"
                  className="spotlight question"
                  onClick={() => setFilter("unknown")}
                >
                  <CircleHelp size={25} />
                  <span>
                    <strong>One small question to clear up.</strong>
                    <span>
                      {unknown.length} {unknown.length === 1 ? "item needs" : "items need"} an
                      item-specific return rule. No dates guessed.
                    </span>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ) : null}
              <section className="shelf-section">
                <div className="shelf-title">
                  <h2>
                    Your shelf <span>{purchases.length}</span>
                  </h2>
                  {purchases.some((p) => p.synthetic) ? (
                    <span className="sample-label">Contains fictional samples</span>
                  ) : (
                    <span className="quiet footnote">Proof, kept close.</span>
                  )}
                </div>
                <div className="shelf-tools">
                  <div className="tabs" aria-label="Filter purchases">
                    {[
                      ["all", "All items"],
                      ["soon", "Coming up"],
                      ["unknown", "Policy needed"],
                      ["passed", "Past dates"],
                      ["closed", "Closed"],
                    ].map(([v, l]) => (
                      <button
                        type="button"
                        key={v}
                        aria-pressed={filter === v}
                        className={filter === v ? "selected" : ""}
                        onClick={() => setFilter(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      type="search"
                      placeholder="Find an item or merchant"
                      aria-label="Search purchases"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {purchases.length ? (
                  <>
                    <div className="list-head">
                      <span>ITEM / MERCHANT</span>
                      <span>PURCHASED</span>
                      <span>RETURN DATE</span>
                      <span>WARRANTY DATE</span>
                    </div>
                    <div className="purchase-list">
                      {visible.map((p) => {
                        const status = returnStatus(p, today);
                        const ret = returnDeadline(p);
                        const war = warrantyDeadline(p);

                        return (
                          <button
                            type="button"
                            className="purchase-row"
                            key={p.id}
                            onClick={() => setSelected(p.id)}
                            aria-label={`Open ${p.item}`}
                          >
                            <span className="item-cell">
                              <span className={`item-icon ${status.key}`}>
                                <ItemIcon item={p.item} />
                              </span>
                              <span>
                                <strong>{p.item}</strong>
                                <small>
                                  {p.merchant}
                                  {p.synthetic ? " · sample" : ""}
                                </small>
                              </span>
                            </span>
                            <span className="purchase-cell">
                              <strong>{money(p)}</strong>
                              <small>{formatDate(p.purchaseDate)}</small>
                            </span>
                            <span className="return-cell">
                              <span className={`status ${status.tone}`}>{status.label}</span>
                              <small>
                                {ret.date ? formatDate(ret.date) : "Rule not confirmed"}
                              </small>
                            </span>
                            <span className="warranty-cell">
                              <ShieldCheck size={14} />
                              <span>
                                {war.date
                                  ? formatDate(war.date)
                                  : war.state === "none"
                                    ? "None recorded"
                                    : "Not confirmed"}
                              </span>
                            </span>
                            <ChevronRight className="row-chevron" size={18} />
                          </button>
                        );
                      })}
                      {!visible.length ? (
                        <div className="empty-results">
                          <Search size={27} />
                          <h3>Nothing in this view.</h3>
                          <p>Try another filter or search.</p>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setFilter("all");
                              setSearch("");
                            }}
                          >
                            Show all purchases
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div
                    className={`first-drop ${drag ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      drop(e.dataTransfer.files[0]).catch(() =>
                        setError("Could not read this receipt. Try again."),
                      );
                    }}
                  >
                    <div className="drop-icon">
                      <Upload size={27} strokeWidth={1.5} />
                    </div>
                    <h3>Your first receipt is a fresh start.</h3>
                    <p>
                      Drop a document here, or paste its text.
                      <br />
                      We’ll help you verify the purchase, date, and policy.
                    </p>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setImporting(true)}
                    >
                      {busy ? "Reading receipt…" : "Add your first receipt"}
                      <ArrowRight size={16} />
                    </button>
                    <span>Everything stays in this browser.</span>
                  </div>
                )}
              </section>
              <footer className="page-footer">
                <span>
                  <LockKeyhole size={13} />
                  Local by design. Yours by default.
                </span>
                <span>Recorded dates are planning aids. Check the merchant’s terms.</span>
              </footer>
            </>
          ) : null}
          {page === "timeline" && loaded ? (
            <Timeline purchases={purchases} onSelect={setSelected} />
          ) : null}
          {page === "privacy" && loaded ? (
            <Privacy purchases={purchases} onRestore={restore} onClear={clear} busy={busy} />
          ) : null}
        </main>
      </div>
      {importing ? <Importer onClose={() => setImporting(false)} onReady={receiveReceipt} /> : null}
      {receipt ? (
        <ReceiptPicker receipt={receipt} onClose={() => setReceipt(null)} onReady={startDrafts} />
      ) : null}
      {draft ? (
        <Verifier
          key={draft.id}
          initial={draft}
          onClose={cancelDrafts}
          onSave={saveDraft}
          busy={busy}
          queueProgress={
            queueTotal ? { current: queueTotal - queue.length, total: queueTotal } : undefined
          }
        />
      ) : null}
      {detail && !draft && !receipt ? (
        <Detail
          key={detail.id}
          p={detail}
          onClose={() => setSelected(null)}
          onEdit={() => setDraft(detail)}
          onSave={save}
          busy={busy}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <ShieldCheck size={18} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function FileLines() {
  return (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M4 2h18v29l-4-2-5 2-5-2-4 2V2Z" stroke="currentColor" />
      <path d="M8 9h10M8 14h10M8 19h6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

type ItemIconProps = { item: string };
