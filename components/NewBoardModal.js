"use client";

import { useRef, useState } from "react";
import ErrorBanner from "./ErrorBanner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const COLOR_OPTIONS = [
  { value: "#3457D5", label: "Blue" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#E2A63B", label: "Amber" },
  { value: "#2BB673", label: "Green" },
  { value: "#E5573F", label: "Red" },
];

export default function NewBoardModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);

  useFocusTrap({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: nameInputRef,
    onEscape: () => {
      if (!submitting) onClose();
    },
  });

  async function handleSubmit(e) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: trimmed, description: description.trim(), color });
      // On success the caller navigates away, so there's nothing left
      // to reset here.
    } catch (err) {
      setSubmitting(false);
      setError(err.message || "Couldn't create that board.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <button
        aria-label="Close"
        className="fixed inset-0 -z-10"
        onClick={() => !submitting && onClose()}
      />
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-board-title"
        className="w-full max-w-sm rounded-panel bg-surface p-5 shadow-pop"
      >
        <h2 id="new-board-title" className="font-display text-[18px] font-bold text-ink">
          Create a board
        </h2>

        {error ? (
          <div className="mt-3">
            <ErrorBanner message={error} onRetry={handleSubmit} retryLabel="Try again" />
          </div>
        ) : null}

        <div className="mt-4">
          <label className="mb-1.5 block text-[14.5px] font-medium text-ink-faint">
            Name
          </label>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marketing Site Revamp"
            className="w-full rounded-card border border-border bg-canvas px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-[14.5px] font-medium text-ink-faint">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this board for?"
            rows={2}
            className="w-full rounded-card border border-border bg-canvas px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-[14.5px] font-medium text-ink-faint">
            Color
          </label>
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-label={opt.label}
                aria-pressed={color === opt.value}
                onClick={() => setColor(opt.value)}
                className={`h-9 w-9 rounded-full transition-shadow ${
                  color === opt.value ? "ring-2 ring-offset-2 ring-accent" : ""
                }`}
                style={{ backgroundColor: opt.value }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="rounded-card px-3.5 py-1.5 text-[14.5px] font-medium text-ink-faint hover:bg-canvas disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-card bg-accent px-3.5 py-1.5 text-[14.5px] font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create board"}
          </button>
        </div>
      </form>
    </div>
  );
}
