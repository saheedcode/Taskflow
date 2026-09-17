"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonBlock } from "@/components/Skeleton";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { notificationText } from "@/lib/notificationText";

function formatWhen(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setNotifications(null);
    fetchNotifications()
      .then(setNotifications)
      .catch((err) =>
        setError(err.message || "Couldn't load notifications. Try again.")
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleOpen(n) {
    if (n.unread) {
      // The backend returns the full updated notification list from this
      // call (not just the one item) — use that as the new state directly
      // instead of patching this one notification into what we already
      // had, so read state can never drift from what the backend actually
      // persisted.
      markNotificationRead(n.id)
        .then(setNotifications)
        .catch(() => {
          // Non-critical — the read state will resync on next visit.
        });
    }
  }

  async function handleMarkAllRead() {
    if (!notifications?.some((n) => n.unread)) return;
    setMarkingAll(true);
    try {
      // Use the full list the backend returns rather than assuming what
      // "all read" looks like client-side.
      const next = await markAllNotificationsRead();
      setNotifications(next);
    } catch (err) {
      setError(err.message || "Couldn't update notifications. Try again.");
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications?.filter((n) => n.unread).length || 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[14.5px] font-medium text-accent-dark">Activity</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Notifications
            </h1>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="rounded-card border border-border bg-surface px-3.5 py-1.5 text-[14.5px] font-medium text-ink hover:bg-canvas disabled:opacity-50"
            >
              {markingAll ? "Marking..." : "Mark all as read"}
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        ) : notifications === null ? (
          <div className="mt-6 space-y-2" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5"
              >
                <SkeletonBlock className="h-9 w-9 shrink-0 !rounded-full" />
                <div className="flex-1">
                  <SkeletonBlock className="h-3.5 w-3/4" />
                  <SkeletonBlock className="mt-2 h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="You're all caught up"
              description="Activity on your boards — assignments, comments, and moves — will show up here."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {notifications.map((n) => {
              return (
                <a
                  key={n.id}
                  href={`/board/${n.boardId}`}
                  onClick={() => handleOpen(n)}
                  className={`flex items-start gap-3 rounded-card border p-3.5 transition-colors ${
                    n.unread
                      ? "border-accent/30 bg-accent-light/40 hover:bg-accent-light/60"
                      : "border-border bg-surface hover:bg-canvas"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-[13.5px]"
                  >
                    {n.verb === "due_soon" ? "⏰" : n.verb === "mentioned" ? "@" : "👤"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] leading-snug text-ink">{notificationText(n)}</p>
                    <p className="mt-1 text-[13.5px] text-ink-faint">
                      {n.boardName} · {formatWhen(n.createdAt)}
                    </p>
                  </div>
                  {n.unread ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                    />
                  ) : null}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
