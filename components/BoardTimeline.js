"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BoardSidebar from "./BoardSidebar";
import EmptyState from "./EmptyState";
import { workspace as fallbackWorkspace } from "@/lib/mockData";
import { getPriority } from "@/lib/priorities";
import * as api from "@/lib/api";
import { initialsFor, colorForId } from "@/lib/avatar";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const SIDEBAR_KEY = "tf_sidebar_collapsed";

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate + "T23:59:59") < new Date();
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Buckets cards into date-based groups for the timeline. A card with no
// due date can't be placed on a timeline at all, so it gets its own
// trailing "No due date" group instead of being silently dropped.
function bucketFor(dueDate, today) {
  if (!dueDate) return "none";
  const due = startOfDay(new Date(dueDate + "T00:00:00"));
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "week";
  return "later";
}

const BUCKET_META = {
  overdue: { label: "Overdue", dot: "bg-danger" },
  today: { label: "Today", dot: "bg-accent" },
  week: { label: "This week", dot: "bg-warn" },
  later: { label: "Later", dot: "bg-ink-faint" },
  none: { label: "No due date", dot: "bg-ink-faint" },
};
const BUCKET_ORDER = ["overdue", "today", "week", "later", "none"];

export default function BoardTimeline({ initialBoard }) {
  const router = useRouter();
  const [board] = useState(initialBoard);
  const [workspaceName, setWorkspaceName] = useState(fallbackWorkspace.name);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [filterListId, setFilterListId] = useState("");
  const mobileSidebarRef = useRef(null);

  useFocusTrap({ active: mobileSidebarOpen, containerRef: mobileSidebarRef, onEscape: () => setMobileSidebarOpen(false) });

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // localStorage unavailable — default expanded.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchWorkspace()
      .then((ws) => {
        if (!cancelled) setWorkspaceName(ws.name);
      })
      .catch(() => {});
    function onWorkspaceChanged() {
      router.push("/workspace");
    }
    window.addEventListener("tf:workspace-changed", onWorkspaceChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("tf:workspace-changed", onWorkspaceChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // Non-critical if it can't persist.
      }
      return next;
    });
  }

  const listById = useMemo(() => {
    const map = {};
    board.lists.forEach((l) => (map[l.id] = l));
    return map;
  }, [board]);

  const doneList = board.lists.find((l) => /done|shipped|complete/i.test(l.name));
  const allCards = Object.values(board.cards);
  const activeTasks = allCards.length;
  const doneCount = doneList ? doneList.cardIds.length : 0;
  const velocity = activeTasks + doneCount > 0 ? Math.round((doneCount / (activeTasks + doneCount)) * 100) : 0;

  const listOfCard = useMemo(() => {
    const map = {};
    board.lists.forEach((l) => l.cardIds.forEach((id) => (map[id] = l.id)));
    return map;
  }, [board]);

  const today = startOfDay(new Date());
  const groups = useMemo(() => {
    const buckets = { overdue: [], today: [], week: [], later: [], none: [] };
    allCards.forEach((card) => {
      if (filterListId && listOfCard[card.id] !== filterListId) return;
      buckets[bucketFor(card.dueDate, today)].push(card);
    });
    Object.keys(buckets).forEach((key) => {
      buckets[key].sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    });
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, filterListId]);

  const totalPlaced = allCards.length;
  const totalWithDue = allCards.filter((c) => c.dueDate).length;

  return (
    <div className="flex h-full bg-canvas">
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-ink-900/50"
          />
          <div ref={mobileSidebarRef} className="absolute inset-y-0 left-0 shadow-pop" role="dialog" aria-modal="true" aria-label="Board navigation">
            <BoardSidebar
              boardId={board.id}
              boardName={board.name}
              progress={velocity}
              active="timeline"
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="hidden shrink-0 lg:block">
        <BoardSidebar
          boardId={board.id}
          boardName={board.name}
          progress={velocity}
          active="timeline"
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card text-ink-muted hover:bg-canvas lg:hidden"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex min-w-0 items-center gap-1.5 text-[14.5px] text-ink-muted">
            <span className="hidden truncate sm:inline">{workspaceName}</span>
            <span className="hidden text-ink-faint sm:inline">/</span>
            <strong className="truncate font-display font-bold text-ink">{board.name}</strong>
            <span className="text-ink-faint">/</span>
            <span className="truncate font-semibold text-ink">Timeline</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={filterListId}
              onChange={(e) => setFilterListId(e.target.value)}
              aria-label="Filter by list"
              className="rounded-full border border-border bg-surface px-2.5 py-[6px] text-[13.5px] font-semibold text-ink-muted focus:border-accent"
            >
              <option value="">All lists</option>
              {board.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {totalPlaced === 0 ? (
            <EmptyState
              title="Nothing to show yet"
              description="Add some cards to this board and they'll show up here, organized by due date."
            />
          ) : (
            <div className="mx-auto max-w-3xl">
              <p className="mb-5 text-[13.5px] text-ink-faint">
                {totalWithDue} of {totalPlaced} card{totalPlaced === 1 ? "" : "s"} have a due date.
                Cards are grouped below by how soon they're due.
              </p>

              <div className="relative pl-5">
                <div className="absolute bottom-0 left-[7px] top-1.5 w-px bg-border" aria-hidden="true" />
                {BUCKET_ORDER.filter((key) => groups[key].length > 0).map((key) => (
                  <div key={key} className="relative mb-7 last:mb-0">
                    <span
                      className={`absolute -left-5 top-1 h-3 w-3 rounded-full ring-4 ring-canvas ${BUCKET_META[key].dot}`}
                      aria-hidden="true"
                    />
                    <h2 className="mb-2.5 font-display text-[15px] font-bold text-ink">
                      {BUCKET_META[key].label}
                      <span className="ml-2 text-[13px] font-semibold text-ink-faint">
                        {groups[key].length}
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {groups[key].map((card) => (
                        <TimelineCard key={card.id} card={card} list={listById[listOfCard[card.id]]} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineCard({ card, list }) {
  const prio = getPriority(card.priority);
  const due = formatDue(card.dueDate);
  const overdue = isOverdue(card.dueDate);
  const assignees = card.assignees || [];

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: prio.color }}
        title={`${prio.name} priority`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium text-ink">{card.title}</p>
        {list ? <p className="truncate text-[12.5px] text-ink-faint">{list.name}</p> : null}
      </div>
      {due ? (
        <span
          className={`shrink-0 text-[13px] font-semibold ${overdue ? "text-danger" : "text-ink-muted"}`}
        >
          {due}
        </span>
      ) : null}
      {assignees.length ? (
        <div className="flex -space-x-1.5">
          {assignees.slice(0, 3).map((a) => (
            <span
              key={a.id}
              title={a.name}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-surface text-[10px] font-semibold text-white"
              style={{ backgroundColor: colorForId(a.id) }}
            >
              {initialsFor(a.name)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
