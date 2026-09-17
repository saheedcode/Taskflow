"use client";

import { getPriority } from "@/lib/priorities";
import { initialsFor, colorForId } from "@/lib/avatar";

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(`${dateStr.slice(0, 10)}T23:59:59`) < new Date();
}

// Short, stable "TF-xx" style code derived from the card id — purely a
// cosmetic identifier, not a persisted field.
function codeFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `TF-${(hash % 90) + 10}`;
}


export default function CardItem({
  card,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onOpen,
  onKeyDown,
  dragging,
  pickedUp,
  moveInProgress,
  elRef,
}) {
  const due = formatDue(card.dueDate);
  const overdue = isOverdue(card.dueDate);
  const prio = getPriority(card.priority);
  // Free-text labels — no palette/color to look up, just render the
  // strings directly.
  const cardLabels = card.labels || [];
  // Real backend cards carry assignees embedded as full
  // {id, name, avatarUrl} objects (GET /api/boards/:id nested card
  // shape) — no separate member lookup needed.
  const cardAssignees = card.assignees || [];

  return (
    <div
      ref={elRef}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onClick={() => {
        // Ignore stray clicks on other cards while one is being moved with
        // the keyboard — Escape/Space are the way to resolve that first.
        if (moveInProgress && !pickedUp) return;
        onOpen();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}, ${prio.name} priority${due ? `, due ${due}` : ""}. Press Enter to open, Space to pick up and move with arrow keys.`}
      aria-pressed={pickedUp}
      aria-roledescription={pickedUp ? "Grabbed card, use arrow keys to move" : undefined}
      onKeyDown={onKeyDown}
      className={`cursor-grab rounded-card border bg-surface p-3.5 text-left shadow-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${
        pickedUp
          ? "border-accent ring-2 ring-accent shadow-pop"
          : "border-border"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold tracking-wide text-ink-faint">
          {codeFor(card.id)}
        </span>
        <span
          className="rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-extrabold tracking-wide"
          style={{ backgroundColor: prio.tint, color: prio.color }}
        >
          {prio.name.toUpperCase()}
        </span>
      </div>

      <p className="text-[15px] font-semibold leading-snug text-ink">
        {card.title}
      </p>

      {cardLabels.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cardLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-[7px] bg-canvas px-2 py-[3px] text-[12.5px] font-bold text-ink-muted"
            >
              <span className="h-[7px] w-[7px] rounded-full bg-ink-faint" />
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2.5 text-ink-faint">
        {due ? (
          <span
            className={`flex items-center gap-1.5 text-[13px] font-medium ${
              overdue ? "font-bold text-danger" : "text-ink-faint"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="19" height="19" rx="2" stroke="currentColor" strokeWidth="2.5" />
              <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2.5" />
            </svg>
            {due}
          </span>
        ) : null}

        {card.commentCount ? (
          <span className="flex items-center gap-1.5 text-[13px]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
                stroke="currentColor"
                strokeWidth="2.3"
              />
            </svg>
            {card.commentCount}
          </span>
        ) : null}

        {cardAssignees.length ? (
          <div className="ml-auto flex -space-x-2">
            {cardAssignees.slice(0, 3).map((m) => (
              <span
                key={m.id}
                title={m.name}
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-surface text-[11px] font-semibold text-white"
                style={{ backgroundColor: colorForId(m.id) }}
              >
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initialsFor(m.name)
                )}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
