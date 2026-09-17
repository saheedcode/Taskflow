"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonBlock } from "@/components/Skeleton";
import { fetchMembers, getActiveWorkspaceId, searchWorkspace } from "@/lib/api";
import { describeApiError } from "@/lib/errorMessages";
import { initialsFor, colorForId } from "@/lib/avatar";

// GET /api/workspaces/:id/search now paginates server-side (`limit`,
// default 25, capped at 100; `offset`, default 0) and returns
// { items, total, hasMore }. This page fetches one page at a time and
// shows a "Load more" control while hasMore is true, rather than trying
// to pull every match in one request the way it used to have to.
const PAGE_SIZE = 25;

// The date <input> gives back a plain "YYYY-MM-DD" string; the backend
// wants a full ISO timestamp. Treat "on or before" / "on or after" as
// inclusive of the whole selected day.
function toIsoStart(dateStr) {
  return dateStr ? `${dateStr}T00:00:00.000Z` : undefined;
}
function toIsoEnd(dateStr) {
  return dateStr ? `${dateStr}T23:59:59.999Z` : undefined;
}

function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [label, setLabel] = useState("");
  const [dueAfter, setDueAfter] = useState("");
  const [dueBefore, setDueBefore] = useState("");

  const [members, setMembers] = useState([]);
  const [results, setResults] = useState(null); // null = haven't searched yet / in flight
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchMembers().then(setMembers).catch(() => {
      // Non-critical — the assignee dropdown just stays empty.
    });
  }, []);

  const hasAnyFilter = Boolean(q.trim() || assigneeId || label.trim() || dueAfter || dueBefore);

  const currentFilters = useCallback(
    () => ({
      q,
      assigneeId,
      label,
      dueAfter: toIsoStart(dueAfter),
      dueBefore: toIsoEnd(dueBefore),
    }),
    [q, assigneeId, label, dueAfter, dueBefore]
  );

  // Fresh search from the top — always offset 0, replaces whatever
  // results were showing.
  const runSearch = useCallback(() => {
    const workspaceId = getActiveWorkspaceId();
    const thisRequest = ++requestIdRef.current;
    setError(null);
    setResults(null);
    setHasSearched(true);

    searchWorkspace(workspaceId, { ...currentFilters(), limit: PAGE_SIZE, offset: 0 })
      .then(({ items, total: newTotal, hasMore: more }) => {
        if (requestIdRef.current !== thisRequest) return; // a newer search superseded this one
        setResults(items);
        setTotal(newTotal);
        setHasMore(more);
      })
      .catch((err) => {
        if (requestIdRef.current !== thisRequest) return;
        setError(describeApiError(err, {}, "Couldn't run that search. Try again."));
      });
  }, [currentFilters]);

  // Fetches the next page and appends it, rather than starting over —
  // keeps whatever results/scroll position the person already has.
  function loadMore() {
    if (loadingMore || !hasMore) return;
    const workspaceId = getActiveWorkspaceId();
    const thisRequest = requestIdRef.current;
    setLoadingMore(true);

    searchWorkspace(workspaceId, {
      ...currentFilters(),
      limit: PAGE_SIZE,
      offset: results?.length || 0,
    })
      .then(({ items, total: newTotal, hasMore: more }) => {
        if (requestIdRef.current !== thisRequest) return;
        setResults((prev) => [...(prev || []), ...items]);
        setTotal(newTotal);
        setHasMore(more);
      })
      .catch((err) => {
        if (requestIdRef.current !== thisRequest) return;
        setError(describeApiError(err, {}, "Couldn't load more results. Try again."));
      })
      .finally(() => {
        if (requestIdRef.current === thisRequest) setLoadingMore(false);
      });
  }

  // Debounce so every keystroke in the text fields doesn't fire a request
  // — the dropdown/date filters feel fine re-searching immediately, but
  // debounce them too for one consistent flow instead of two.
  useEffect(() => {
    if (!hasAnyFilter) {
      setResults(null);
      setTotal(0);
      setHasMore(false);
      setHasSearched(false);
      setError(null);
      return;
    }
    const timer = setTimeout(runSearch, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, assigneeId, label, dueAfter, dueBefore]);

  function clearFilters() {
    setQ("");
    setAssigneeId("");
    setLabel("");
    setDueAfter("");
    setDueBefore("");
    setResults(null);
    setTotal(0);
    setHasMore(false);
    setHasSearched(false);
    setError(null);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 md:py-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14.5px] font-medium text-accent-dark">Workspace search</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Search cards
          </h1>
          <p className="text-[14.5px] text-ink-muted">
            Searches every board in this workspace at once — not just the one you have open.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
          <div className="relative">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title or description..."
              className="w-full rounded-card border border-border bg-canvas py-2 pl-9 pr-3 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-ink-muted" htmlFor="search-assignee">
                Assignee
              </label>
              <select
                id="search-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="rounded-card border border-border bg-canvas px-2.5 py-2 text-[14px] text-ink focus:border-accent focus:bg-surface"
              >
                <option value="">Anyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-ink-muted" htmlFor="search-label">
                Label
              </label>
              <input
                id="search-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. bug"
                className="rounded-card border border-border bg-canvas px-2.5 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-ink-muted" htmlFor="search-due-after">
                Due after
              </label>
              <input
                id="search-due-after"
                type="date"
                value={dueAfter}
                onChange={(e) => setDueAfter(e.target.value)}
                className="rounded-card border border-border bg-canvas px-2.5 py-2 text-[14px] text-ink focus:border-accent focus:bg-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-ink-muted" htmlFor="search-due-before">
                Due before
              </label>
              <input
                id="search-due-before"
                type="date"
                value={dueBefore}
                onChange={(e) => setDueBefore(e.target.value)}
                className="rounded-card border border-border bg-canvas px-2.5 py-2 text-[14px] text-ink focus:border-accent focus:bg-surface"
              />
            </div>
          </div>

          {hasAnyFilter ? (
            <div>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[13.5px] font-medium text-ink-faint hover:text-ink"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          {!hasAnyFilter ? (
            <EmptyState
              title="Search across every board"
              description="Filter by keyword, assignee, label, or due date — results come from all boards in this workspace, not just one."
            />
          ) : error ? (
            <ErrorBanner message={error} onRetry={runSearch} />
          ) : results === null ? (
            <div className="flex flex-col gap-2.5" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title="No matching cards"
              description="Try loosening a filter — a broader keyword, or clearing the due-date range."
            />
          ) : (
            <>
              <p className="mb-3 text-[13.5px] text-ink-faint">
                Showing {results.length.toLocaleString()} of {total.toLocaleString()}{" "}
                {total === 1 ? "result" : "results"}
              </p>

              <ul className="flex flex-col gap-2.5">
                {results.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/board/${card.boardId}`)}
                      className="flex w-full flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-accent"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-[14.5px] text-ink">{card.title}</p>
                        {card.dueDate ? (
                          <span className="shrink-0 whitespace-nowrap text-[13px] text-ink-faint">
                            {formatDue(card.dueDate)}
                          </span>
                        ) : null}
                      </div>

                      {card.description ? (
                        <p className="line-clamp-2 text-[13.5px] text-ink-muted">
                          {card.description}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <span className="text-[12.5px] text-ink-faint">
                          {card.boardName}
                          {card.listName ? ` · ${card.listName}` : ""}
                        </span>

                        {(card.labels || []).map((l) => (
                          <span
                            key={l}
                            className="rounded-full bg-canvas px-2 py-0.5 text-[12px] font-medium text-ink-muted"
                          >
                            {l}
                          </span>
                        ))}

                        {(card.assignees || []).length ? (
                          <span className="flex -space-x-1.5">
                            {card.assignees.map((a) => (
                              <span
                                key={a.id}
                                title={a.name}
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-surface text-[10px] font-semibold text-white"
                                style={{ backgroundColor: colorForId(a.id) }}
                              >
                                {a.avatarUrl ? (
                                  <img
                                    src={a.avatarUrl}
                                    alt=""
                                    className="h-full w-full rounded-full object-cover"
                                  />
                                ) : (
                                  initialsFor(a.name)
                                )}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-card border border-border bg-surface px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:border-accent disabled:opacity-60"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
