import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    const active = document.activeElement;

    const previous = active instanceof HTMLElement || active instanceof SVGElement ? active : null;

    const dialog = ref.current;
    dialog?.showModal();
    heading.current?.focus();

    return () => {
      dialog?.close();
      previous?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key !== "Tab") {
          return;
        }

        const nodes = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((node) => node.offsetParent !== null);

        const first = nodes[0];
        const last = nodes.at(-1);

        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === heading.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

type FieldControlProps = { id?: string; "aria-describedby"?: string };

export function Field({ label, children, hint }: FieldProps) {
  const id = useId();

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children, {
            id,
            "aria-describedby": hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

export function Notice({ children, kind = "info" }: NoticeProps) {
  return (
    <div className={`notice ${kind}`} role={kind === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

type FieldProps = {
  label: string;
  children: ReactElement<FieldControlProps>;
  hint?: ReactNode;
};

type NoticeProps = {
  children: ReactNode;
  kind?: "info" | "error" | "success";
};
