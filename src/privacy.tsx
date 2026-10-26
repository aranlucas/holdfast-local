import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, FolderLock, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import type { Purchase } from "./model";
import { downloadBlob } from "./exports";
import type { BackupPart } from "./backup-archive";
import { Notice } from "./ui";

export function Privacy({ purchases, onRestore, onClear, busy }: PrivacyProps) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [clear, setClear] = useState(false);
  const [success, setSuccess] = useState("");
  const [backupParts, setBackupParts] = useState<BackupPart[]>([]);

  const file = useRef<HTMLInputElement>(null);
  const disabled = busy || working;
  const operation = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => operation.current?.abort(), []);

  function beginOperation() {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setWorking(true);
    setError("");
    setSuccess("");

    return controller;
  }

  function cancelOperation() {
    operation.current?.abort();
    setWorking(false);
    setSuccess("Backup operation canceled.");

    if (file.current) {
      file.current.value = "";
    }
  }

  function finishOperation(controller: AbortController, clearInput = false) {
    if (operation.current !== controller) {
      return;
    }

    setSaving(false);

    if (!controller.signal.aborted) {
      setWorking(false);
    }

    if (clearInput && file.current) {
      file.current.value = "";
    }
  }

  async function backup() {
    const controller = beginOperation();
    setBackupParts([]);

    try {
      const { exportBackup } = await import("./backup");
      controller.signal.throwIfAborted();
      const parts = await exportBackup(purchases, { signal: controller.signal });
      controller.signal.throwIfAborted();

      if (parts.length === 1) {
        downloadBlob(parts[0].blob, parts[0].name);
        setSuccess(
          "Backup download started. Keep it somewhere you trust; it contains your receipt data and documents.",
        );
      } else {
        setBackupParts(parts);
        setSuccess(
          `Backup ready in ${parts.length} files. Download every volume and the required index below. Keep their original filenames together.`,
        );
      }
    } catch {
      if (!controller.signal.aborted) {
        setError("Could not create the backup. Your device data is unchanged. Try again.");
      }
    } finally {
      finishOperation(controller);
    }
  }

  async function restore(files: File[]) {
    if (!files.length) {
      return;
    }

    const controller = beginOperation();

    try {
      const { importBackup } = await import("./backup");
      controller.signal.throwIfAborted();
      const p = await importBackup(files, { signal: controller.signal });
      controller.signal.throwIfAborted();
      setSaving(true);
      await onRestore(p);
      controller.signal.throwIfAborted();
      setSuccess(
        `Restored ${p.length} purchases. Matching IDs were updated; other purchases were kept.`,
      );
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        e instanceof Error
          ? e.message
          : "Could not restore this backup. No purchases were changed.",
      );
    } finally {
      finishOperation(controller, true);
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
            Purchases and original documents are stored in this browser’s IndexedDB, on this device.
            Reading a receipt, calculating dates, and building a packet happen locally. The app has
            no analytics or external AI calls.
          </p>
          <p>
            This is local storage, not an encrypted vault. Anyone using this browser profile can
            open it. A different browser, device, address, or port has a separate cabinet. Browser
            clearing or storage eviction can remove your data.
          </p>
          <p>
            Keep a backup before clearing browser data. Your exported packet or backup contains the
            evidence you put in; share it intentionally.
          </p>
          <div className="device-facts">
            <span>Current cabinet</span>
            <strong>{location.origin}</strong>
            <span>Date display zone</span>
            <strong>{new Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
            <span>Saved purchases</span>
            <strong>{purchases.length}</strong>
          </div>
        </section>
        <section className="backup-panel">
          <h2>Take the cabinet with you.</h2>
          <p>
            Back up every purchase and original document. Large backups have several ZIP parts. Keep
            every part and select them together when restoring on another device or browser.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={disabled}
            onClick={() => void backup()}
          >
            <ArrowDownToLine size={17} />
            {working ? "Working…" : "Download device backup"}
          </button>
          <BackupDownloads parts={backupParts} disabled={disabled} />
          <CancelBackup working={working} saving={saving} onCancel={cancelOperation} />
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={() => file.current?.click()}
          >
            <Upload size={17} />
            Restore a Holdfast backup
          </button>
          <input
            ref={file}
            hidden
            type="file"
            disabled={disabled}
            multiple
            aria-label="Backup file"
            onChange={(e) => void restore(Array.from(e.target.files ?? []))}
          />
          <p className="footnote">
            Restore validates the full backup before saving. Purchases with matching IDs are
            updated. Other purchases stay.
          </p>
          <hr />
          <h3>Start fresh on this device.</h3>
          <p className="footnote">
            Clear all saved purchases and original documents in this cabinet. Download a backup
            first if you want to keep them.
          </p>
          {clear ? (
            <div className="clear-confirm">
              <p>
                Clear all {purchases.length} purchases from this device? This cannot be undone
                without your backup.
              </p>
              <button
                type="button"
                className="button danger"
                disabled={disabled}
                onClick={() => {
                  setError("");
                  void onClear()
                    .then(() => {
                      setClear(false);

                      return setSuccess("This device cabinet is now empty.");
                    })
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : "Could not clear. Try again."),
                    );
                }}
              >
                Yes, clear this device
              </button>
              <button type="button" className="text-button" onClick={() => setClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button danger-text"
              disabled={disabled || !purchases.length}
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

type CancelBackupProps = { working: boolean; saving: boolean; onCancel: () => void };

function CancelBackup({ working, saving, onCancel }: CancelBackupProps) {
  if (!working) {
    return null;
  }

  return (
    <button type="button" className="text-button" disabled={saving} onClick={onCancel}>
      {saving ? "Saving validated backup…" : "Cancel backup operation"}
    </button>
  );
}

type BackupDownloadsProps = { parts: BackupPart[]; disabled: boolean };

function BackupDownloads({ parts, disabled }: BackupDownloadsProps) {
  if (!parts.length) {
    return null;
  }

  return (
    <ol aria-label="Backup parts">
      {parts.map((part, index) => (
        <li key={part.name}>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => downloadBlob(part.blob, part.name)}
          >
            Download file {index + 1} of {parts.length}: {part.name}
          </button>
        </li>
      ))}
    </ol>
  );
}

type PrivacyProps = {
  purchases: Purchase[];
  onRestore: (p: Purchase[]) => Promise<void>;
  onClear: () => Promise<void>;
  busy: boolean;
};
