"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * "Are you sure?" gate in front of logging out, so a stray click on the
 * sidebar/tab-bar button can't end the session by accident. `onConfirm`
 * should perform the actual sign-out + redirect; this component only
 * handles the confirm/cancel UI and its own submitting state.
 *
 * Rendered via a portal straight into document.body: this component is
 * always opened from inside NavContent, which itself lives inside either
 * the desktop sidebar (position: fixed) or the mobile account drawer
 * (also position: fixed, with its own dark backdrop). Nesting a *second*
 * fixed, full-screen overlay inside one of those meant it was competing
 * with the drawer/sidebar's own stacking context instead of the page's —
 * visually it read as the confirm dialog getting squashed into the
 * sidebar/board content behind it rather than popping up as its own
 * clean, centered overlay. A portal sidesteps that entirely: no matter
 * where <LogoutConfirmModal> is mounted in the React tree, its DOM node
 * is a direct child of <body>, on top of everything, every time.
 */
export default function LogoutConfirmModal({ onConfirm, onClose }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useFocusTrap({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: () => {
      if (!loggingOut) onClose();
    },
  });

  async function handleConfirm() {
    setLoggingOut(true);
    // onConfirm typically redirects immediately after clearing the
    // session, so this component doesn't need to reset state afterward.
    await onConfirm();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <button
        aria-label="Close"
        className="fixed inset-0 -z-10"
        onClick={() => !loggingOut && onClose()}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        aria-describedby="logout-modal-desc"
        className="w-full max-w-sm rounded-panel bg-surface p-5 shadow-pop sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-light text-danger">
            <LogOutIcon />
          </span>
          <div>
            <h2 id="logout-modal-title" className="font-display text-[17px] font-bold text-ink">
              Log out of TaskFlow?
            </h2>
            <p id="logout-modal-desc" className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">
              You'll need to log back in to access your boards and notifications.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => !loggingOut && onClose()}
            disabled={loggingOut}
            className="rounded-card px-3.5 py-2 text-[14.5px] font-medium text-ink-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loggingOut}
            className="flex items-center justify-center gap-2 rounded-card bg-danger px-3.5 py-2 text-[14.5px] font-medium text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? <Spinner /> : null}
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function LogOutIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H9M16 16l4-4-4-4M20 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
