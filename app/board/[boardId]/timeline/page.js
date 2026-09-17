"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import BoardTimeline from "@/components/BoardTimeline";
import ErrorBanner from "@/components/ErrorBanner";
import { KanbanBoardSkeleton } from "@/components/Skeleton";
import { fetchBoard } from "@/lib/api";
import { ApiError } from "@/lib/apiClient";
import { describeApiError } from "@/lib/errorMessages";

export default function BoardTimelinePage({ params }) {
  const { boardId } = params;
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setNotFound(false);
    setBoard(null);
    fetchBoard(boardId)
      .then(setBoard)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(describeApiError(err, {}, "Couldn't load this board. Try again."));
        }
      });
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <AppShell>
        <div className="flex h-[70vh] flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-lg font-semibold text-ink">
            Board not found
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            It may have been moved, or the link is out of date.
          </p>
          <a
            href="/workspace"
            className="mt-4 rounded-card bg-accent px-4 py-2 text-[14.5px] font-medium text-white hover:bg-accent-dark"
          >
            Back to boards
          </a>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex h-[70vh] flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (board === null) {
    return (
      <AppShell>
        <div className="h-[calc(100vh-3.5rem)] md:h-screen">
          <KanbanBoardSkeleton />
        </div>
      </AppShell>
    );
  }

  return (
    <div className="h-screen">
      <BoardTimeline initialBoard={board} />
    </div>
  );
}
