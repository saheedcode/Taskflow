"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_DURATION = 3200;

// Lightweight toast queue: push a message, it auto-dismisses after a
// few seconds (or the caller can dismiss it early). Kept local to
// whichever component owns the actions worth confirming, rather than
// a global provider — the app only needs this on the board right now.
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const pushToast = useCallback(
    (message, { duration = DEFAULT_DURATION } = {}) => {
      const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message }]);
      timers.current[id] = setTimeout(() => dismissToast(id), duration);
      return id;
    },
    [dismissToast]
  );

  return { toasts, pushToast, dismissToast };
}

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-card border border-border bg-ink-900 px-4 py-2.5 text-[14.5px] font-medium text-white shadow-pop"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-success">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-white/50 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
