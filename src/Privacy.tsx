import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  FolderLock,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Purchase } from "./model";
import { downloadBlob, exportBackup, importBackup } from "./exports";
import { Notice } from "./ui";

export function Privacy({
  purchases,
  onRestore,
  onClear,
  busy,
}: {
  purchases: Purchase[];
  onRestore: (p: Purchase[]) => Promise<void>;
  onClear: () => Promise<void>;
  busy: boolean;
}) {
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [clear, setClear] = useState(false),
    [success, setSuccess] = useState("");

  const file = useRef<HTMLInputElement>(null);

  async function backup() {
    setWorking(true);
    setError("");

    try {
      downloadBlob(await exportBackup(purchases), "Holdfast-device-backup.zip");
      setSuccess(
        "Backup downloaded. Keep it somewhere you trust; it contains your receipt data and documents.",
      );
    } catch {
      setError(
        "Could not create the backup. Your device data is unchanged. Try again.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function restore(f?: File) {
    if (!f) return;
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const p = await importBackup(f);
      await onRestore(p);
      setSuccess(
        `Restored ${p.length} purchases. Matching IDs were updated; other purchases were kept.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not restore this backup. No purchases were changed.",
      );
    } finally {
      setWorking(false);

      if (file.current) file.current.value = "";
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Your receipts.
            <br />
            Your device.
          </h1>
          <p>No account. No inbox. No background uploads.</p>
        </div>
        <FolderLock size={46} strokeWidth={1.2} />
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}
      <div className="privacy-page">
        <section>
          <ShieldCheck size={28} />
          <h2>A small, private filing cabinet.</h2>
          <p>
            Purchases and original documents are stored in this browser’s
            IndexedDB, on this device. Reading a receipt, calculating dates, and
            building a packet happen locally. The app has no analytics or
            external AI calls.
          </p>
          <p>
            This is local storage, not an encrypted vault. Anyone using this
            browser profile can open it. A different browser, device, address,
            or port has a separate cabinet. Browser clearing or storage eviction
            can remove your data.
          </p>
          <p>
            Keep a backup before clearing browser data. Your exported packet or
            backup contains the evidence you put in; share it intentionally.
          </p>
          <div className="device-facts">
            <span>Current cabinet</span>
            <strong>{location.origin}</strong>
            <span>Date display zone</span>
            <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
            <span>Saved purchases</span>
            <strong>{purchases.length}</strong>
          </div>
        </section>
        <section className="backup-panel">
          <h2>Take the cabinet with you.</h2>
          <p>
            Back up every purchase and original document. Restore your exported
            ZIP on another device or browser.
          </p>
          <button
            className="button primary"
            disabled={busy || working}
            onClick={() => void backup()}
          >
            <ArrowDownToLine size={17} />
            {working ? "Working…" : "Download device backup"}
          </button>
          <button
            className="button secondary"
            disabled={busy || working}
            onClick={() => file.current?.click()}
          >
            <Upload size={17} />
            Restore a Holdfast backup
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept=".zip"
            aria-label="Backup file"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
          <p className="footnote">
            Restore validates the full backup before saving. Purchases with
            matching IDs are updated. Other purchases stay.
          </p>
          <hr />
          <h3>Start fresh on this device.</h3>
          <p className="footnote">
            Clear all saved purchases and original documents in this cabinet.
            Download a backup first if you want to keep them.
          </p>
          {clear ? (
            <div className="clear-confirm">
              <p>
                Clear all {purchases.length} purchases from this device? This
                cannot be undone without your backup.
              </p>
              <button
                className="button danger"
                disabled={busy || working}
                onClick={() => {
                  setError("");
                  void onClear()
                    .then(() => {
                      setClear(false);
                      setSuccess("This device cabinet is now empty.");
                    })
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not clear. Try again.",
                      ),
                    );
                }}
              >
                Yes, clear this device
              </button>
              <button className="text-button" onClick={() => setClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="text-button danger-text"
              disabled={busy || working || !purchases.length}
              onClick={() => setClear(true)}
            >
              <RotateCcw size={16} />
              Clear this device
            </button>
          )}
        </section>
      </div>
    </>
  );
}
