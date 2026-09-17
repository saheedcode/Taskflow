"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BoardSidebar from "./BoardSidebar";
import EmptyState from "./EmptyState";
import { workspace as fallbackWorkspace } from "@/lib/mockData";
import { priorities } from "@/lib/priorities";
import * as api from "@/lib/api";
import { initialsFor, colorForId } from "@/lib/avatar";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const SIDEBAR_KEY = "tf_sidebar_collapsed";
const STAGE_COLORS = ["#9CA0AF", "#3457D5", "#E2A63B", "#2BB673", "#8B5CF6"];

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate + "T23:59:59") < new Date();
}

export default function BoardAnalytics({ initialBoard }) {
  const router = useRouter();
  const [board] = useState(initialBoard);
  const [workspaceName, setWorkspaceName] = useState(fallbackWorkspace.name);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  useEffect(() => {
    if (!board?.workspaceId) return;
    let cancelled = false;
    api
      .fetchMembers(board.workspaceId)
      .then((list) => {
        if (!cancelled) setWorkspaceMembers(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [board?.workspaceId]);

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

  const teamMembers = useMemo(
    () => workspaceMembers.map((m) => ({ ...m, initials: initialsFor(m.name), color: colorForId(m.id) })),
    [workspaceMembers]
  );

  const allCards = Object.values(board.cards);
  const doneList = board.lists.find((l) => /done|shipped|complete/i.test(l.name));
  const doneCount = doneList ? doneList.cardIds.length : 0;
  const activeTasks = allCards.length;
  const velocity = activeTasks + doneCount > 0 ? Math.round((doneCount / (activeTasks + doneCount)) * 100) : 0;
  const overdueCount = allCards.filter((c) => isOverdue(c.dueDate)).length;

  const loadByMember = {};
  allCards.forEach((c) => (c.assignees || []).forEach((a) => {
    loadByMember[a.id] = (loadByMember[a.id] || 0) + 1;
  }));
  const boardMembers = teamMembers.filter((m) => allCards.some((c) => (c.assignees || []).some((a) => a.id === m.id)));
  const teamRail = boardMembers.length ? boardMembers : teamMembers;
  const teamLoad = teamRail.length
    ? Math.round((Object.values(loadByMember).reduce((a, b) => a + b, 0) / teamRail.length) * 20)
    : 0;
  const teamLoadClamped = Math.min(teamLoad, 100);

  const perList = board.lists.map((list, i) => ({
    id: list.id,
    name: list.name,
    count: list.cardIds.length,
    color: STAGE_COLORS[i % STAGE_COLORS.length],
  }));
  const maxListCount = Math.max(1, ...perList.map((l) => l.count));

  const perPriority = Object.keys(priorities).map((key) => ({
    id: key,
    name: priorities[key].name,
    color: priorities[key].color,
    count: allCards.filter((c) => (c.priority || "med") === key).length,
  }));
  const maxPriorityCount = Math.max(1, ...perPriority.map((p) => p.count));

  const unassignedCount = allCards.filter((c) => !(c.assignees || []).length).length;
  const noDueCount = allCards.filter((c) => !c.dueDate).length;

  const memberLoadRows = teamRail
    .map((m) => ({ ...m, count: loadByMember[m.id] || 0 }))
    .sort((a, b) => b.count - a.count);
  const maxMemberCount = Math.max(1, ...memberLoadRows.map((m) => m.count));

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
              active="analytics"
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
          active="analytics"
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
            <span className="truncate font-semibold text-ink">Analytics</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {allCards.length === 0 ? (
            <EmptyState
              title="Nothing to analyze yet"
              description="Add some cards to this board to see stats here."
            />
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              {/* Stat strip */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                <StatCard label="Active tasks" value={activeTasks} delta={`${doneCount} completed`} />
                <StatCard
                  label="Cycle velocity"
                  value={`${velocity}%`}
                  valueClass="text-accent"
                  delta={velocity >= 70 ? "on pace" : velocity >= 40 ? "steady" : "behind pace"}
                  deltaClass={velocity >= 70 ? "text-success" : velocity >= 40 ? "text-ink-faint" : "text-danger"}
                />
                <StatCard
                  label="Overdue"
                  value={overdueCount}
                  valueClass={overdueCount ? "text-danger" : undefined}
                  delta={overdueCount ? "needs attention" : "none overdue"}
                  deltaClass={overdueCount ? "text-danger" : "text-success"}
                />
                <StatCard
                  label="Team load"
                  value={`${teamLoadClamped}%`}
                  delta={teamLoadClamped >= 80 ? "high" : teamLoadClamped >= 40 ? "balanced" : "light"}
                  deltaClass="text-ink-faint"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Cards per list */}
                <Panel title="Cards by list">
                  <div className="space-y-2.5">
                    {perList.map((l) => (
                      <BarRow key={l.id} label={l.name} count={l.count} max={maxListCount} color={l.color} />
                    ))}
                  </div>
                </Panel>

                {/* Priority breakdown */}
                <Panel title="Priority breakdown">
                  <div className="space-y-2.5">
                    {perPriority.map((p) => (
                      <BarRow key={p.id} label={p.name} count={p.count} max={maxPriorityCount} color={p.color} />
                    ))}
                  </div>
                </Panel>

                {/* Team workload */}
                <Panel title="Team workload">
                  {memberLoadRows.length === 0 ? (
                    <p className="text-[13.5px] text-ink-faint">No assignees on this board yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {memberLoadRows.map((m) => (
                        <BarRow key={m.id} label={m.name} count={m.count} max={maxMemberCount} color={m.color} />
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Coverage */}
                <Panel title="Coverage">
                  <div className="space-y-3">
                    <CoverageRow
                      label="Unassigned cards"
                      count={unassignedCount}
                      total={activeTasks}
                    />
                    <CoverageRow
                      label="Cards without a due date"
                      count={noDueCount}
                      total={activeTasks}
                    />
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, valueClass, delta, deltaClass }) {
  return (
    <div className="rounded-card border border-border bg-surface px-[16px] py-[14px]">
      <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">{label}</p>
      <p className={`font-display text-[24px] font-bold ${valueClass || "text-ink"}`}>{value}</p>
      {delta ? (
        <p className={`mt-0.5 text-[13px] font-semibold ${deltaClass || "text-ink-faint"}`}>{delta}</p>
      ) : null}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-4">
      <h2 className="mb-3.5 font-display text-[15px] font-bold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function BarRow({ label, count, max, color }) {
  const pct = count > 0 && max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13.5px]">
        <span className="truncate font-medium text-ink-muted">{label}</span>
        <span className="shrink-0 font-bold text-ink">{count}</span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-border-soft">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function CoverageRow({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between rounded-card bg-canvas px-3 py-2.5">
      <span className="text-[13.5px] font-medium text-ink-muted">{label}</span>
      <span className="text-[13.5px] font-bold text-ink">
        {count} <span className="font-normal text-ink-faint">({pct}%)</span>
      </span>
    </div>
  );
}
