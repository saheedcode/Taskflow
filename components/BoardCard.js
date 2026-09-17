"use client";

import { useEffect, useRef, useState } from "react";
import { boardStatus } from "@/lib/mockData";

const STATUS_STYLES = {
  success: { pill: "bg-success-light text-success", bar: "bg-success" },
  accent: { pill: "bg-accent-light text-accent-dark", bar: "bg-accent" },
  danger: { pill: "bg-danger-light text-danger", bar: "bg-danger" },
};

// Deterministic two-tone gradient derived from the board's own color, so
// each tile reads distinctly without any extra "gradient" field in the
// data model.
function gradientFor(hex) {
  return `linear-gradient(135deg, ${hex}, ${shade(hex, 28)})`;
}
function KebabIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function BoardCard({ board, onEdit, onDelete }) {
  // GET /api/workspaces/:id/boards (the real backend endpoint) returns
  // `cardCount` but no "done vs. total" progress figure and no per-board
  // members list — lib/api.js's fetchBoards() reflects that honestly by
  // always setting progressKnown: false, rather than fabricating a
  // number. The status pill and progress bar below are hidden whenever
  // that's the case instead of showing a made-up value.
  const progressKnown = board.progressKnown !== false;
  const progress = Math.max(0, Math.min(100, board.progress ?? 0));
  const status = boardStatus(progress);
  const styles = STATUS_STYLES[status.tone];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <a
      href={`/board/${board.id}`}
      className="group relative flex flex-col rounded-panel border border-border bg-surface p-[20px] shadow-card transition-all hover:-translate-y-0.5 hover:border-border-soft hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="h-[36px] w-[36px] shrink-0 rounded-[10px]"
          style={{ backgroundImage: gradientFor(board.color) }}
          aria-hidden="true"
        />
        <div className="flex items-center gap-1.5">
          {progressKnown ? (
            <span
              className={`rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-extrabold uppercase tracking-wide ${styles.pill}`}
            >
              {status.label}
            </span>
          ) : null}
          {(onEdit || onDelete) && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label={`More options for ${board.name}`}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                className="flex h-8 w-8 items-center justify-center rounded-card text-ink-faint opacity-0 hover:bg-canvas hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
              >
                <KebabIcon />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-card border border-border bg-surface shadow-pop"
                  onClick={(e) => e.preventDefault()}
                >
                  {onEdit ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(false);
                        onEdit(board);
                      }}
                      className="block w-full px-3 py-2 text-left text-[14px] font-medium text-ink hover:bg-canvas"
                    >
                      Edit board
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(false);
                        onDelete(board);
                      }}
                      className="block w-full px-3 py-2 text-left text-[14px] font-medium text-danger hover:bg-danger-light"
                    >
                      Delete board
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <h3 className="mt-3.5 font-display text-[16px] font-semibold leading-snug text-ink group-hover:text-accent-dark">
        {board.name}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[42px] text-[13.5px] leading-[1.5] text-ink-muted">
        {board.description}
      </p>

      {progressKnown ? (
        <div
          className="mt-1 h-[5px] overflow-hidden rounded-full bg-border-soft"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${board.name} progress`}
        >
          <div
            className={`h-full rounded-full ${styles.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <div className="mt-1 h-[5px]" aria-hidden="true" />
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex -space-x-2">
          {/* board.members are full {id, name, initials, color} objects
              (only ever populated for a board just created in this
              browser session — see createBoard in lib/api.js; the real
              GET /api/workspaces/:id/boards endpoint doesn't return a
              members list, so this stays empty for every other board). */}
          {(board.members || []).slice(0, 4).map((m) => (
            <span
              key={m.id}
              title={m.name}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface text-[11.5px] font-semibold text-white"
              style={{ backgroundColor: m.color }}
            >
              {m.initials}
            </span>
          ))}
        </div>
        <span className="text-right text-[13.5px] text-ink-faint">
          {board.cardCount} open task{board.cardCount === 1 ? "" : "s"}
          {board.updatedAt ? <span className="hidden sm:inline"> &middot; {board.updatedAt}</span> : null}
        </span>
      </div>
    </a>
  );
}
