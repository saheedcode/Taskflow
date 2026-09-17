"use client";

import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Generic "are you sure?" gate for destructive actions (delete card, list,
 * board, label...). Modeled on LogoutConfirmModal but parameterized so it
 * doesn't need a bespoke component per action.
 *
 * `onConfirm` may be async and should throw on failure — this component
 * shows the error inline and leaves the dialog open so the person can
 * retry instead of silently losing the action.
 */
export default function ConfirmModal({
  title,
  description,
  confirmLabel = "Delete",
  confirmingLabel = "Deleting...",
  tone = "danger",
  onConfirm,
  onClose,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useFocusTrap({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: () => {
      if (!submitting) onClose();
    },
  });

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setSubmitting(false);
      setError(err.message || "Something went wrong. Try again.");
    }
  }

  const toneStyles =
    tone === "danger"
      ? { iconWrap: "bg-danger-light text-danger", button: "bg-danger hover:brightness-95" }
      : { iconWrap: "bg-accent-light text-accent-dark", button: "bg-accent hover:bg-accent-dark" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <button
        aria-label="Close"
        className="fixed inset-0 -z-10"
        onClick={() => !submitting && onClose()}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="w-full max-w-sm rounded-panel bg-surface p-5 shadow-pop sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneStyles.iconWrap}`}>
            <WarningIcon />
          </span>
          <div>
            <h2 id="confirm-modal-title" className="font-display text-[17px] font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id="confirm-modal-desc" className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-card bg-danger-light px-3 py-2 text-[14px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="rounded-card px-3.5 py-2 text-[14.5px] font-medium text-ink-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`flex items-center justify-center gap-2 rounded-card px-3.5 py-2 text-[14.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.button}`}
          >
            {submitting ? <Spinner /> : null}
            {submitting ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
