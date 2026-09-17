"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import BoardCard from "@/components/BoardCard";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import NewBoardModal from "@/components/NewBoardModal";
import BoardEditModal from "@/components/BoardEditModal";
import ConfirmModal from "@/components/ConfirmModal";
import { BoardGridSkeleton } from "@/components/Skeleton";
import { createBoard, deleteBoard, fetchBoards, fetchWorkspace, updateBoard } from "@/lib/api";
import { describeApiError } from "@/lib/errorMessages";
import { workspace as fallbackWorkspace } from "@/lib/mockData";

export default function WorkspacePage() {
  const router = useRouter();
  const [workspaceInfo, setWorkspaceInfo] = useState(fallbackWorkspace);
  const [boards, setBoards] = useState(null); // null while the first load is in flight
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [deletingBoard, setDeletingBoard] = useState(null);
  const searchInputRef = useRef(null);

  // #search still focuses this board-name filter for anyone linking to it
  // directly. The mobile bottom-tab "Search" button itself now goes to
  // /search (workspace-wide card search across every board) instead —
  // that's the feature people actually mean by "search" in this app.
  useEffect(() => {
    if (window.location.hash === "#search") {
      searchInputRef.current?.focus();
    }
  }, []);

  const load = useCallback(() => {
    setError(null);
    setBoards(null);
    fetchWorkspace()
      .then(setWorkspaceInfo)
      .catch(() => {
        // Non-critical for this view — fall back to the last known name.
      });
    fetchBoards()
      .then(setBoards)
      .catch((err) =>
        setError(err.message || "Couldn't load your boards. Try again.")
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The workspace switcher in the sidebar dispatches this on switch/create
  // so the boards grid updates immediately without a full page reload.
  useEffect(() => {
    window.addEventListener("tf:workspace-changed", load);
    return () => window.removeEventListener("tf:workspace-changed", load);
  }, [load]);

  // Left to reject on failure — NewBoardModal awaits this and shows its
  // own inline error + retry, staying open until it succeeds.
  async function handleCreateBoard({ name, description, color }) {
    try {
      const board = await createBoard({ name, description, color });
      setCreatingOpen(false);
      router.push(`/board/${board.id}`);
    } catch (err) {
      throw new Error(describeApiError(err, {}, "Couldn't create that board."));
    }
  }

  // Left to reject on failure — BoardEditModal awaits this and shows its
  // own inline error + retry, staying open until it succeeds.
  async function handleSaveBoardEdit({ name, description, color }) {
    try {
      const updated = await updateBoard(editingBoard.id, { name, description, color });
      setEditingBoard(null);
      setBoards((prev) => (prev ? prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)) : prev));
    } catch (err) {
      throw new Error(describeApiError(err, {}, "Couldn't save board settings."));
    }
  }

  async function handleConfirmDeleteBoard() {
    try {
      await deleteBoard(deletingBoard.id);
    } catch (err) {
      // The delete option is already hidden for non-owners/admins — this
      // only fires on a bypass.
      throw new Error(
        describeApiError(
          err,
          { 403: "Only owners and admins can delete this board." },
          "Couldn't delete this board."
        )
      );
    }
    setBoards((prev) => (prev ? prev.filter((b) => b.id !== deletingBoard.id) : prev));
    setDeletingBoard(null);
  }

  const query = search.trim().toLowerCase();
  const filteredBoards =
    boards && query
      ? boards.filter(
          (b) =>
            b.name.toLowerCase().includes(query) ||
            b.description.toLowerCase().includes(query)
        )
      : boards;

  return (
    <AppShell
      headerRight={
        <>
          <div className="relative min-w-[160px] flex-1 sm:flex-none">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards"
              className="w-full rounded-card border border-border bg-canvas py-1.5 pl-8 pr-3 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface sm:w-64"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreatingOpen(true)}
            className="rounded-card bg-accent px-3.5 py-1.5 text-[14.5px] font-medium text-white transition-colors hover:bg-accent-dark"
          >
            New board
          </button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14.5px] font-medium text-accent-dark">
            {workspaceInfo.name}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Your boards
          </h1>
        </div>

        {error ? (
          <div className="mt-6">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        ) : boards === null ? (
          <BoardGridSkeleton />
        ) : boards.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="Create your first board"
              description="Boards hold your team's lists and cards. Use New board above to set one up."
            />
          </div>
        ) : query && filteredBoards.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={`No results for "${search.trim()}"`}
              description="Try a different name, or check the spelling."
              action={
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-card border border-border bg-surface px-3.5 py-1.5 text-[14.5px] font-medium text-ink hover:bg-canvas"
                >
                  Clear search
                </button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onEdit={setEditingBoard}
                onDelete={
                  workspaceInfo?.role === "OWNER" || workspaceInfo?.role === "ADMIN"
                    ? setDeletingBoard
                    : undefined
                }
              />
            ))}

            {!query ? (
              <button
                type="button"
                onClick={() => setCreatingOpen(true)}
                className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-panel border-[1.5px] border-dashed border-border font-semibold text-ink-faint transition-colors hover:border-accent hover:bg-accent-light hover:text-accent"
              >
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="text-[14.5px] font-medium">Create a board</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      {creatingOpen ? (
        <NewBoardModal
          onClose={() => setCreatingOpen(false)}
          onCreate={handleCreateBoard}
        />
      ) : null}

      {editingBoard ? (
        <BoardEditModal
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
          onSave={handleSaveBoardEdit}
        />
      ) : null}

      {deletingBoard ? (
        <ConfirmModal
          title={`Delete "${deletingBoard.name}"?`}
          description="This permanently deletes the board and all of its lists and cards. This can't be undone."
          confirmLabel="Delete board"
          confirmingLabel="Deleting..."
          onClose={() => setDeletingBoard(null)}
          onConfirm={handleConfirmDeleteBoard}
        />
      ) : null}
    </AppShell>
  );
}
