"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CardItem from "./CardItem";
import CardModal from "./CardModal";
import ErrorBanner from "./ErrorBanner";
import BoardSidebar from "./BoardSidebar";
import ToastStack, { useToasts } from "./Toast";
import ConfirmModal from "./ConfirmModal";
import BoardEditModal from "./BoardEditModal";
import { workspace as fallbackWorkspace } from "@/lib/mockData";
import { priorities } from "@/lib/priorities";
import * as api from "@/lib/api";
import { getSession } from "@/lib/auth";
import { notificationText } from "@/lib/notificationText";
import { computeReorderPosition, computePositionBetween, sortByPosition } from "@/lib/reorder";
import { describeApiError } from "@/lib/errorMessages";
import { initialsFor, colorForId } from "@/lib/avatar";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBoardSocket } from "@/hooks/useBoardSocket";

const STAGE_COLORS = ["#9CA0AF", "#3457D5", "#E2A63B", "#2BB673", "#8B5CF6"];
const SIDEBAR_KEY = "tf_sidebar_collapsed";

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate + "T23:59:59") < new Date();
}

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function KanbanBoard({ initialBoard }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const boardRef = useRef(initialBoard);
  boardRef.current = board;

  const [draggingCardId, setDraggingCardId] = useState(null);
  const [dragOverListId, setDragOverListId] = useState(null);
  // Where a mouse drag would actually land if dropped right now:
  // { listId, cardId: string|null, position: "before" | "after" | "end" }
  // cardId is null and position is "end" when hovering empty list space
  // below the last card (or an empty list) rather than a specific card.
  const [dropTarget, setDropTarget] = useState(null);
  const [openCard, setOpenCard] = useState(null); // { cardId, listId }
  // Bumped on each comment:created socket event; CardModal watches this
  // and appends the comment if it's currently open on that card. See the
  // socket wiring below.
  const [liveComment, setLiveComment] = useState(null); // { cardId, comment }
  const [addingListOpen, setAddingListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [composingListId, setComposingListId] = useState(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [actionError, setActionError] = useState(null); // { message, onRetry }
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const { toasts, pushToast, dismissToast } = useToasts();
  const [editingListId, setEditingListId] = useState(null);
  const [editingListName, setEditingListName] = useState("");
  const [renamingListId, setRenamingListId] = useState(null);
  const [deletingListId, setDeletingListId] = useState(null); // list id pending confirm
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [editingBoardInfo, setEditingBoardInfo] = useState(false);
  const [deletingBoardConfirm, setDeletingBoardConfirm] = useState(false);
  const boardMenuRef = useRef(null);

  // ---- Chrome state: collapsible sidebar, mobile drawers, notifications ----
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(fallbackWorkspace.name);
  const [workspaceRole, setWorkspaceRole] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Real workspace members (GET /api/workspaces/:id/members), used for
  // CardModal's assignee picker, the assignee *filter* dropdown, the
  // team rail, and comment-author display. `teamMembers` below is the
  // same list enriched with display-only initials/color (the backend
  // doesn't send either) — everything in this file that needs a member
  // list for display reads from `teamMembers`, not this raw one.
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const teamMembers = useMemo(
    () => workspaceMembers.map((m) => ({ ...m, initials: initialsFor(m.name), color: colorForId(m.id) })),
    [workspaceMembers]
  );
  // Real logged-in user (for the header avatar), resolved from the
  // stored session the same way CardModal.js does.
  const [sessionUser, setSessionUser] = useState({ name: "", initials: "" });
  useEffect(() => {
    const session = getSession();
    if (session) setSessionUser(session);
    function onSessionUpdated(e) {
      if (e.detail) setSessionUser(e.detail);
    }
    window.addEventListener("tf:session-updated", onSessionUpdated);
    return () => window.removeEventListener("tf:session-updated", onSessionUpdated);
  }, []);
  const mobileSidebarRef = useRef(null);
  const mobileRailRef = useRef(null);
  const notifMenuRef = useRef(null);

  useFocusTrap({ active: mobileSidebarOpen, containerRef: mobileSidebarRef, onEscape: () => setMobileSidebarOpen(false) });
  useFocusTrap({ active: mobileRailOpen, containerRef: mobileRailRef, onEscape: () => setMobileRailOpen(false) });
  useFocusTrap({ active: notifOpen, containerRef: notifMenuRef, onEscape: () => setNotifOpen(false) });

  // ---- Keyboard-operable drag-and-drop alternative ----
  // Mouse/touch dragging is handled by draggingCardId/dragOverListId above.
  // This tracks a card "picked up" via the keyboard: focus a card and press
  // Space to grab it, arrow keys move it between/within lists (each press
  // commits immediately, same as a mouse drop), Space/Enter drops it where
  // it is, and Escape cancels and puts it back where it started.
  const [keyboardMove, setKeyboardMove] = useState(null); // { cardId, originListId, originIndex }
  const [announcement, setAnnouncement] = useState("");
  const cardRefs = useRef({});
  const announceTimer = useRef(null);

  function announce(message) {
    // Re-announcing the same string back-to-back wouldn't trigger the
    // live region again, so clear it first on a microtask.
    setAnnouncement("");
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(message), 30);
  }

  useEffect(() => () => clearTimeout(announceTimer.current), []);

  // After any move, keep focus on the card that's being moved — otherwise
  // it re-mounts under a different list and keyboard focus is lost.
  useEffect(() => {
    if (keyboardMove) {
      cardRefs.current[keyboardMove.cardId]?.focus();
    }
  }, [board, keyboardMove]);

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
        if (!cancelled) {
          setWorkspaceName(ws.name);
          // DELETE /api/boards/:id is OWNER/ADMIN only per the doc (PATCH,
          // i.e. board settings/rename, is open to MEMBERs too — no gate
          // needed there). Hide the option rather than let a MEMBER hit
          // a 403 after confirming.
          setWorkspaceRole(ws.role);
        }
      })
      .catch(() => {});

    // If the person switches workspaces (via the nav switcher) while a
    // board from the old one is open, this board no longer applies —
    // send them back to the boards grid for the newly active workspace.
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

  useEffect(() => {
    if (!boardMenuOpen) return;
    function onDocClick(e) {
      if (!boardMenuRef.current?.contains(e.target)) setBoardMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [boardMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchNotifications()
      .then((list) => {
        if (!cancelled) setNotifications(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Real member list for CardModal's assignee picker/comment authors —
  // re-fetched whenever the board's workspace changes.
  useEffect(() => {
    if (!board?.workspaceId) return;
    let cancelled = false;
    api
      .fetchMembers(board.workspaceId)
      .then((list) => {
        if (!cancelled) setWorkspaceMembers(list);
      })
      .catch(() => {
        // Non-critical — CardModal just shows an empty assignee list
        // until this succeeds.
      });
    return () => {
      cancelled = true;
    };
  }, [board?.workspaceId]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  async function handleMarkAllRead() {
    try {
      const next = await api.markAllNotificationsRead();
      setNotifications(next);
    } catch {
      // Non-critical — badge just stays as-is until next successful refresh.
    }
  }

  // Real-time "who's viewing this board" — populated from the socket's
  // presence:sync events (see the socket wiring below), not the member
  // list. Starts empty until the first presence:sync arrives after
  // connecting.
  const [presence, setPresence] = useState([]);

  // ---- Real stats, computed straight from board data ----
  // Cards from GET /api/boards/:id (and every place they're merged back
  // in below) carry assignees embedded as full {id, name, avatarUrl}
  // objects under `assignees` — not a bare `assigneeIds` array — so
  // every member/filter computation below reads `card.assignees`.
  const allCards = Object.values(board.cards);
  const activeTasks = allCards.length;
  const overdueCount = allCards.filter((c) => isOverdue(c.dueDate)).length;
  const doneList = board.lists.find((l) => /done|shipped|complete/i.test(l.name));
  const doneCount = doneList ? doneList.cardIds.length : 0;
  const velocity = activeTasks + doneCount > 0 ? Math.round((doneCount / (activeTasks + doneCount)) * 100) : 0;
  const loadByMember = {};
  allCards.forEach((c) => (c.assignees || []).forEach((a) => {
    loadByMember[a.id] = (loadByMember[a.id] || 0) + 1;
  }));

  const boardMembers = useMemo(
    () => teamMembers.filter((m) => allCards.some((c) => (c.assignees || []).some((a) => a.id === m.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamMembers, board]
  );
  const teamRail = boardMembers.length ? boardMembers : teamMembers;

  const teamLoad = teamRail.length
    ? Math.round((Object.values(loadByMember).reduce((a, b) => a + b, 0) / teamRail.length) * 20)
    : 0;
  const teamLoadClamped = Math.min(teamLoad, 100);

  const filtersActive = Boolean(
    searchQuery.trim() || filterPriority || filterLabel || filterAssignee
  );

  function clearFilters() {
    setSearchQuery("");
    setFilterPriority("");
    setFilterLabel("");
    setFilterAssignee("");
  }

  const query = searchQuery.trim().toLowerCase();
  function cardMatchesFilters(card) {
    if (!card) return false;
    if (query && !card.title.toLowerCase().includes(query)) return false;
    if (filterPriority && card.priority !== filterPriority) return false;
    if (filterLabel && !(card.labels || card.labelIds)?.includes(filterLabel)) return false;
    if (filterAssignee && !(card.assignees || []).some((a) => a.id === filterAssignee)) return false;
    return true;
  }

  // Free-text labels have no palette to enumerate — derive the filter
  // chip set from whatever labels actually appear on this board's cards.
  const boardLabels = useMemo(() => {
    const set = new Set();
    Object.values(board.cards).forEach((c) => {
      (c.labels || c.labelIds || []).forEach((l) => set.add(l));
    });
    return Array.from(set).sort();
  }, [board]);

  const visibleListData = useMemo(
    () =>
      board.lists.map((list) => ({
        ...list,
        visibleCardIds: filtersActive
          ? list.cardIds.filter((id) => cardMatchesFilters(board.cards[id]))
          : list.cardIds,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, searchQuery, filterPriority, filterLabel, filterAssignee]
  );
  const totalVisible = visibleListData.reduce((n, l) => n + l.visibleCardIds.length, 0);

  // ---- Recent activity: GET /api/boards/:id/activity (most-recent-first
  // per the doc). The doc now documents the entry shape explicitly:
  // { id, action, userId, cardId, createdAt } — `action` is already a
  // full human-readable sentence with the actor's name baked in (e.g.
  // "Ayomide moved card \"Fix login bug\""), unlike notifications'
  // separate actor+verb shape. TeamAndActivity below renders `action`
  // directly rather than re-prefixing an author name, with light
  // fallbacks kept only in case an entry is ever missing it.
  const [boardActivity, setBoardActivity] = useState([]);
  const [activityError, setActivityError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .fetchBoardActivity(board.id)
      .then((list) => {
        if (!cancelled) setBoardActivity(list);
      })
      .catch(() => {
        // Non-critical for the board view — the rail just shows nothing
        // rather than blocking the whole board on this one panel.
        if (!cancelled) setActivityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [board.id]);

  // ---- Real-time (Socket.io) ----
  //
  // Best-effort per the doc: these handlers only ever supplement board
  // state that REST already loaded/confirmed. Nothing here is treated as
  // authoritative — if a socket event never arrives, the board is simply
  // as fresh as the last successful REST call, same as before this
  // existed. See hooks/useBoardSocket.js for the connect/join/leave and
  // reconnect-detection plumbing.

  function handleSocketCardUpdated({ cardId, fields }) {
    if (!cardId || !fields) return;
    // `fields` mirrors the PATCH /api/cards/:id body (title, description,
    // dueDate, labels, assigneeIds), but board.cards stores assignees as
    // embedded {id, name, avatarUrl} objects under `assignees` (see
    // normalizeBoard in lib/api.js), not raw `assigneeIds`. Resolve each
    // id against the workspace member list (already loaded for the
    // CardModal assignee picker) so a live update from someone else's
    // edit shows the same {id, name, avatarUrl} shape a REST fetch
    // would've produced — an id with no match in that list (stale
    // membership, not yet loaded) is dropped rather than shown as a
    // broken avatar.
    const { assigneeIds, ...safeFields } = fields;
    if (Array.isArray(assigneeIds)) {
      safeFields.assignees = assigneeIds
        .map((id) => teamMembers.find((m) => m.id === id))
        .filter(Boolean)
        .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl }));
    }
    setBoard((current) => {
      if (!current.cards[cardId]) return current;
      return {
        ...current,
        cards: { ...current.cards, [cardId]: { ...current.cards[cardId], ...safeFields } },
      };
    });
  }

  function handleSocketCardMoved({ cardId, targetListId, newPosition }) {
    if (!cardId || !targetListId || typeof newPosition !== "number") return;
    setBoard((current) => {
      if (!current.cards[cardId]) return current;
      const targetExists = current.lists.some((l) => l.id === targetListId);
      if (!targetExists) return current;

      const lists = current.lists.map((l) => ({
        ...l,
        cardIds: l.cardIds.filter((id) => id !== cardId),
      }));
      const nextCards = {
        ...current.cards,
        [cardId]: { ...current.cards[cardId], position: newPosition },
      };
      const targetList = lists.find((l) => l.id === targetListId);
      targetList.cardIds = sortByPosition(
        [...targetList.cardIds, cardId].map((id) => nextCards[id])
      ).map((c) => c.id);

      return { ...current, lists, cards: nextCards };
    });
  }

  function handleSocketCommentCreated({ cardId, comment }) {
    if (!cardId || !comment) return;
    setLiveComment({ cardId, comment });
  }

  function handleSocketPresenceSync(list) {
    setPresence(
      list.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        initials: initialsFor(p.name),
        color: colorForId(p.id),
      }))
    );
  }

  function handleSocketReconnect() {
    // Whatever happened while the socket was down was missed entirely —
    // refetch over REST rather than trusting local state built from
    // events that did or didn't arrive. Silent on failure: this is a
    // background reconciliation, not a user-initiated load, so it
    // shouldn't pop an ErrorBanner over whatever the person is doing.
    api.fetchBoard(board.id).then(setBoard).catch(() => {});
  }

  // Per the doc, `board:join` is rejected (no `presence:sync`, this
  // event instead) when the connected user isn't actually a member of
  // this board's workspace. REST access is already gated server-side
  // (fetchBoard would have 403'd before the board ever rendered), so in
  // practice this only fires for a stale membership edge case (e.g.
  // removed from the workspace mid-session) — surfaced as a toast rather
  // than a blocking error, since the board the person already loaded is
  // still valid to look at, it just won't receive further live updates.
  function handleSocketJoinError(message) {
    pushToast(message || "Live updates aren't available for this board.");
  }

  useBoardSocket(board.id, {
    onCardUpdated: handleSocketCardUpdated,
    onCardMoved: handleSocketCardMoved,
    onCommentCreated: handleSocketCommentCreated,
    onPresenceSync: handleSocketPresenceSync,
    onReconnect: handleSocketReconnect,
    onJoinError: handleSocketJoinError,
  });

  // Applies an optimistic board update immediately, then confirms it
  // against the fake API. On failure the board reverts to how it was
  // before the optimistic update, and an ErrorBanner with a retry
  // action (re-running this same mutation) is surfaced. On success,
  // an optional toast confirms the action to the person who did it.
  async function mutate(nextBoard, apiCall, failMessage, successMessage) {
    const previous = boardRef.current;
    setBoard(nextBoard);
    setActionError(null);
    try {
      await apiCall();
      if (successMessage) pushToast(successMessage);
    } catch (err) {
      setBoard(previous);
      setActionError({
        message: err.message || failMessage,
        onRetry: () => mutate(nextBoard, apiCall, failMessage, successMessage),
      });
    }
  }

  // Lowest-level move primitive: applies an already-computed `newPosition`
  // to `cardId`, moves it into `targetListId`, re-derives that list's
  // display order via the shared sortByPosition helper (lib/reorder.js —
  // never a spliced-in index), and confirms the change against the fake
  // API. Both moveCardToIndex (keyboard) and moveCardBetween (mouse
  // drag-and-drop) below funnel through this single function, so there is
  // exactly one place that calls api.moveCard and exactly one place that
  // mutates board state for a card move.
  function applyCardMove(cardId, targetListId, newPosition, { silent } = {}) {
    if (!cardId) return;
    const previous = boardRef.current;
    const lists = previous.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
    const sourceList = lists.find((l) => l.cardIds.includes(cardId));
    if (!sourceList) return;
    sourceList.cardIds = sourceList.cardIds.filter((id) => id !== cardId);

    const targetList = lists.find((l) => l.id === targetListId);
    if (!targetList) return;

    const nextCards = {
      ...previous.cards,
      [cardId]: { ...previous.cards[cardId], position: newPosition },
    };

    // Re-derive the target list's display order from positions instead
    // of splicing at the raw drop index, so it can't drift out of sync
    // with the position value actually sent to the API below.
    targetList.cardIds = sortByPosition(
      [...targetList.cardIds, cardId].map((id) => nextCards[id])
    ).map((c) => c.id);

    const next = { ...previous, lists, cards: nextCards };
    mutate(
      next,
      () => api.moveCard(previous.id, cardId, targetListId, newPosition, sourceList.id),
      "Couldn't save that move. Your board has been restored.",
      !silent && sourceList.id !== targetListId ? `Card moved to ${targetList.name}` : undefined
    );
  }

  // Keyboard-move path: `targetIndex` is a visual slot among the target
  // list's current siblings (excluding the moved card itself), translated
  // to a real float `position` here via the shared computeReorderPosition
  // helper, then applied through applyCardMove above.
  function moveCardToIndex(cardId, targetListId, targetIndex, opts) {
    const previous = boardRef.current;
    if (!previous.lists.some((l) => l.cardIds.includes(cardId))) return;
    const targetList = previous.lists.find((l) => l.id === targetListId);
    if (!targetList) return;

    const siblingIds = targetList.cardIds.filter((id) => id !== cardId);
    const insertAt =
      targetIndex === undefined || targetIndex === null
        ? siblingIds.length
        : Math.min(Math.max(targetIndex, 0), siblingIds.length);
    const siblingPositions = siblingIds.map((id) => previous.cards[id]?.position);
    const newPosition = computeReorderPosition(siblingPositions, insertAt);

    applyCardMove(cardId, targetListId, newPosition, opts);
  }

  // Mouse drag-and-drop path: the person drops relative to a specific
  // card (or the empty space below the last one), so the target position
  // is computed directly from that card's real neighbors' `position`
  // values via the shared computePositionBetween helper — not from an
  // index. This stays correct even when a search/filter is hiding other
  // cards in the list, where an index into the *visible* list wouldn't
  // line up with an index into the real, unfiltered sibling array.
  // beforeId/afterId (either may be null) are resolved by handleDrop
  // below from the current dropTarget.
  function moveCardBetween(cardId, targetListId, beforeId, afterId, opts) {
    const previous = boardRef.current;
    const beforePos = beforeId ? previous.cards[beforeId]?.position : undefined;
    const afterPos = afterId ? previous.cards[afterId]?.position : undefined;
    const newPosition = computePositionBetween(beforePos, afterPos);
    applyCardMove(cardId, targetListId, newPosition, opts);
  }

  // Resolves the current dropTarget (a specific card + before/after, or
  // "end") into the pair of neighbor card ids the dragged card should
  // land between, then commits the move. Falls back to "append to the
  // end of this list" if a drop lands without ever registering a hover
  // position (e.g. a very fast drag where dragover never fired).
  function handleDrop(targetListId) {
    if (!draggingCardId) return;
    const cardId = draggingCardId;
    const targetList = boardRef.current.lists.find((l) => l.id === targetListId);
    const siblingIds = (targetList?.cardIds || []).filter((id) => id !== cardId);

    let beforeId = null;
    let afterId = null;
    if (dropTarget && dropTarget.listId === targetListId && dropTarget.cardId) {
      const idx = siblingIds.indexOf(dropTarget.cardId);
      if (dropTarget.position === "before") {
        afterId = dropTarget.cardId;
        beforeId = idx > 0 ? siblingIds[idx - 1] : null;
      } else {
        beforeId = dropTarget.cardId;
        afterId = idx >= 0 && idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null;
      }
    } else {
      // No specific card hovered (dropped on empty list space, or a fast
      // drag with no dragover) — append after whatever's currently last.
      beforeId = siblingIds[siblingIds.length - 1] || null;
    }

    setDraggingCardId(null);
    setDragOverListId(null);
    setDropTarget(null);
    moveCardBetween(cardId, targetListId, beforeId, afterId);
  }

  // ---- Keyboard move: pick up with Space, arrow keys to move, Space/Enter
  // to drop, Escape to cancel and snap back to the starting position. ----
  function findCardLocation(b, cardId) {
    for (const list of b.lists) {
      const index = list.cardIds.indexOf(cardId);
      if (index !== -1) return { listId: list.id, index };
    }
    return null;
  }

  function handleCardPickup(cardId) {
    const loc = findCardLocation(boardRef.current, cardId);
    if (!loc) return;
    setKeyboardMove({ cardId, originListId: loc.listId, originIndex: loc.index });
    const listName = boardRef.current.lists.find((l) => l.id === loc.listId)?.name || "list";
    announce(`Picked up card, currently in ${listName}. Use arrow keys to move it, Space or Enter to drop, Escape to cancel.`);
  }

  function handleCardDrop() {
    if (!keyboardMove) return;
    const loc = findCardLocation(boardRef.current, keyboardMove.cardId);
    const list = boardRef.current.lists.find((l) => l.id === loc?.listId);
    setKeyboardMove(null);
    if (list && loc) {
      announce(`Dropped card in ${list.name}, position ${loc.index + 1} of ${list.cardIds.length}.`);
    }
  }

  function handleCardMoveCancel() {
    if (!keyboardMove) return;
    const { cardId, originListId, originIndex } = keyboardMove;
    const originName = boardRef.current.lists.find((l) => l.id === originListId)?.name || "list";
    moveCardToIndex(cardId, originListId, originIndex, { silent: true });
    setKeyboardMove(null);
    announce(`Move canceled. Card returned to ${originName}.`);
  }

  function handleKeyboardMoveStep(cardId, direction) {
    const b = boardRef.current;
    const loc = findCardLocation(b, cardId);
    if (!loc) return;
    const listIndex = b.lists.findIndex((l) => l.id === loc.listId);

    if (direction === "left" || direction === "right") {
      const targetListIndex = direction === "left" ? listIndex - 1 : listIndex + 1;
      if (targetListIndex < 0 || targetListIndex >= b.lists.length) return;
      const targetList = b.lists[targetListIndex];
      const targetIndex = Math.min(loc.index, targetList.cardIds.length);
      moveCardToIndex(cardId, targetList.id, targetIndex, { silent: true });
      announce(`Moved to ${targetList.name}, position ${targetIndex + 1} of ${targetList.cardIds.length + 1}.`);
    } else {
      const list = b.lists[listIndex];
      const newIndex = direction === "up" ? loc.index - 1 : loc.index + 1;
      if (newIndex < 0 || newIndex >= list.cardIds.length) return;
      moveCardToIndex(cardId, list.id, newIndex, { silent: true });
      announce(`Moved within ${list.name} to position ${newIndex + 1} of ${list.cardIds.length}.`);
    }
  }

  function handleCardKeyDown(e, card, listId) {
    const isPicked = keyboardMove?.cardId === card.id;

    if (isPicked) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const direction = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
        handleKeyboardMoveStep(card.id, direction);
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleCardDrop();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCardMoveCancel();
        return;
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      setOpenCard({ cardId: card.id, listId });
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      handleCardPickup(card.id);
    }
  }

  function handleAddList(e) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    setNewListName("");
    setAddingListOpen(false);

    const previous = boardRef.current;
    const tempId = `l_temp_${Date.now()}`;
    const next = {
      ...previous,
      lists: [...previous.lists, { id: tempId, name, cardIds: [] }],
    };

    mutate(
      next,
      () =>
        api.createList(previous.id, name).then((list) => {
          // Swap the temporary id for the real one once it's confirmed.
          setBoard((b) => ({
            ...b,
            lists: b.lists.map((l) => (l.id === tempId ? list : l)),
          }));
        }),
      "Couldn't create that list. Try again."
    );
  }

  function handleAddCard(listId) {
    const title = newCardTitle.trim();
    if (!title) {
      setComposingListId(null);
      return;
    }
    setNewCardTitle("");

    const previous = boardRef.current;
    const listName = previous.lists.find((l) => l.id === listId)?.name || "list";
    const tempId = `c_temp_${Date.now()}`;
    const tempCard = {
      id: tempId,
      title,
      description: "",
      labels: [],
      priority: "med",
      dueDate: null,
      assignees: [],
      commentCount: 0,
    };
    const next = {
      ...previous,
      lists: previous.lists.map((l) =>
        l.id === listId ? { ...l, cardIds: [...l.cardIds, tempId] } : l
      ),
      cards: { ...previous.cards, [tempId]: tempCard },
    };

    mutate(
      next,
      () =>
        api.createCard(previous.id, listId, title, tempCard.priority).then((card) => {
          // Swap the temporary card in for the confirmed one.
          setBoard((b) => {
            const { [tempId]: _discard, ...rest } = b.cards;
            return {
              ...b,
              lists: b.lists.map((l) =>
                l.id === listId
                  ? { ...l, cardIds: l.cardIds.map((id) => (id === tempId ? card.id : id)) }
                  : l
              ),
              cards: { ...rest, [card.id]: card },
            };
          });
        }),
      "Couldn't create that card. Try again.",
      `Card added to ${listName}`
    );
  }

  // Used by CardModal, which awaits this and shows its own inline
  // error + retry rather than the board-level banner, since the modal
  // is still open and is a better place to surface the failure.
  async function handleSaveCard(updatedCard) {
    const { listId: targetListId, ...cardFields } = updatedCard;
    const previous = boardRef.current;

    let lists = previous.lists;
    const sourceList = previous.lists.find((l) => l.cardIds.includes(cardFields.id));
    const isMoving = Boolean(targetListId && sourceList && sourceList.id !== targetListId);
    if (isMoving) {
      lists = previous.lists.map((l) => {
        if (l.id === sourceList.id) return { ...l, cardIds: l.cardIds.filter((id) => id !== cardFields.id) };
        if (l.id === targetListId) return { ...l, cardIds: [...l.cardIds, cardFields.id] };
        return l;
      });
    }

    const next = {
      ...previous,
      lists,
      cards: { ...previous.cards, [cardFields.id]: cardFields },
    };
    setBoard(next);

    let saved;
    try {
      // api.updateCard's return already merges the backend's authoritative
      // response over cardFields (fresh `assignees` embedded objects,
      // etc.), keeping only `priority` from our local value since that
      // field never round-trips through the backend. Apply it back into
      // board state — the optimistic `cardFields` above still carries
      // whatever `assignees` the card had *before* this edit (attemptSave
      // only touches `assigneeIds`), so without this, a changed assignee
      // selection wouldn't visually update on the card until the next
      // full board refetch even though it saved correctly.
      saved = await api.updateCard(previous.id, cardFields);
    } catch (err) {
      // The edit itself never reached the backend — nothing was saved,
      // so it's safe to revert everything (including the optimistic
      // list move) back to how the board looked before this call.
      setBoard(previous);
      throw err;
    }

    setBoard((current) => ({
      ...current,
      cards: { ...current.cards, [saved.id]: saved },
    }));

    if (isMoving) {
      try {
        // Real float position, not the array index this used to pass —
        // append at the end of the target list's existing (pre-move)
        // siblings via the shared helper, same as every other move path.
        const targetSiblingIds = previous.lists
          .find((l) => l.id === targetListId)
          .cardIds.filter((id) => id !== cardFields.id);
        const targetSiblingPositions = targetSiblingIds.map((id) => previous.cards[id]?.position);
        const newPosition = computeReorderPosition(targetSiblingPositions, targetSiblingPositions.length);

        await api.moveCard(previous.id, cardFields.id, targetListId, newPosition, sourceList.id);
        pushToast(`Card moved to ${lists.find((l) => l.id === targetListId).name}`);
      } catch (err) {
        // The field edit above already saved successfully — only the
        // move failed. Undo just the optimistic list move (put the card
        // back in its original list) rather than reverting the whole
        // board to `previous`, which would silently discard the field
        // edit the backend already has.
        setBoard((current) => ({
          ...current,
          lists: current.lists.map((l) => {
            if (l.id === targetListId) return { ...l, cardIds: l.cardIds.filter((id) => id !== cardFields.id) };
            if (l.id === sourceList.id) {
              return l.cardIds.includes(cardFields.id)
                ? l
                : { ...l, cardIds: [...l.cardIds, cardFields.id] };
            }
            return l;
          }),
        }));
        throw err;
      }
    }
  }

  function handleRenameList(listId, rawName) {
    const trimmed = rawName.trim();
    setEditingListId(null);
    const previous = boardRef.current;
    const list = previous.lists.find((l) => l.id === listId);
    if (!list || !trimmed || trimmed === list.name) return;

    setRenamingListId(listId);
    const next = {
      ...previous,
      lists: previous.lists.map((l) => (l.id === listId ? { ...l, name: trimmed } : l)),
    };
    mutate(
      next,
      () => api.renameList(previous.id, listId, trimmed),
      "Couldn't rename that list. Try again.",
      `List renamed to "${trimmed}"`
    ).finally(() => setRenamingListId((id) => (id === listId ? null : id)));
  }

  async function handleDeleteList(listId) {
    const previous = boardRef.current;
    const list = previous.lists.find((l) => l.id === listId);
    if (!list) {
      setDeletingListId(null);
      return;
    }
    const remainingCards = { ...previous.cards };
    list.cardIds.forEach((id) => delete remainingCards[id]);
    const next = {
      ...previous,
      lists: previous.lists.filter((l) => l.id !== listId),
      cards: remainingCards,
    };
    setBoard(next);
    try {
      await api.deleteList(previous.id, listId);
      pushToast(`List "${list.name}" deleted`);
      setDeletingListId(null);
    } catch (err) {
      setBoard(previous);
      throw err;
    }
  }

  // Used by CardModal; on success the modal closes itself, so this just
  // updates board state and lets errors bubble back to the modal's own
  // inline retry UI.
  async function handleDeleteCard(cardId) {
    const previous = boardRef.current;
    if (!previous.cards[cardId]) return;
    const next = {
      ...previous,
      lists: previous.lists.map((l) => ({ ...l, cardIds: l.cardIds.filter((id) => id !== cardId) })),
      cards: Object.fromEntries(Object.entries(previous.cards).filter(([id]) => id !== cardId)),
    };
    setBoard(next);
    try {
      await api.deleteCard(previous.id, cardId);
      pushToast("Card deleted");
    } catch (err) {
      setBoard(previous);
      throw err;
    }
  }

  async function handleSaveBoardInfo({ name, description, color }) {
    try {
      const updated = await api.updateBoard(board.id, { name, description, color });
      setEditingBoardInfo(false);
      setBoard((prev) => ({ ...prev, name: updated.name, color: updated.color }));
    } catch (err) {
      throw new Error(describeApiError(err, {}, "Couldn't save board settings."));
    }
  }

  async function handleConfirmDeleteBoard() {
    try {
      await api.deleteBoard(board.id);
    } catch (err) {
      // The menu item is already hidden for non-owners/admins (see
      // workspaceRole above) — this only fires on a bypass.
      throw new Error(
        describeApiError(
          err,
          { 403: "Only owners and admins can delete this board." },
          "Couldn't delete this board."
        )
      );
    }
    router.push("/workspace");
  }

  return (
    <div className="flex h-full bg-canvas">
      {/* Mobile sidebar drawer */}
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
              active="board"
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <BoardSidebar
          boardId={board.id}
          boardName={board.name}
          progress={velocity}
          active="board"
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

          <div className="hidden min-w-0 items-center gap-1.5 text-[14.5px] text-ink-muted sm:flex">
            <span className="truncate">{workspaceName}</span>
            <span className="text-ink-faint">/</span>
            <strong className="truncate font-display font-bold text-ink">{board.name}</strong>
            <div className="relative shrink-0" ref={boardMenuRef}>
              <button
                type="button"
                onClick={() => setBoardMenuOpen((v) => !v)}
                aria-label="Board settings"
                aria-haspopup="true"
                aria-expanded={boardMenuOpen}
                className="flex h-8 w-8 items-center justify-center rounded-card text-ink-faint hover:bg-canvas hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="5" r="1.6" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.6" fill="currentColor" />
                </svg>
              </button>
              {boardMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-7 z-40 w-40 overflow-hidden rounded-card border border-border bg-surface shadow-pop"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setBoardMenuOpen(false);
                      setEditingBoardInfo(true);
                    }}
                    className="block w-full px-3 py-2 text-left text-[14px] font-medium text-ink hover:bg-canvas"
                  >
                    Board settings
                  </button>
                  {workspaceRole === "OWNER" || workspaceRole === "ADMIN" ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        setDeletingBoardConfirm(true);
                      }}
                      className="block w-full px-3 py-2 text-left text-[14px] font-medium text-danger hover:bg-danger-light"
                    >
                      Delete board
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative min-w-[140px] flex-1 sm:max-w-[260px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards..."
              className="w-full rounded-card border border-border bg-canvas py-1.5 pl-7 pr-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden -space-x-2 sm:flex" title="Currently viewing">
              {presence.slice(0, 4).map((m) => (
                <span
                  key={m.id}
                  title={m.name}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-[12px] font-semibold text-white ring-2 ring-success/40"
                  style={{ backgroundColor: m.color }}
                >
                  {m.initials}
                </span>
              ))}
              {presence.length > 4 ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-ink-faint text-[12px] font-semibold text-white">
                  +{presence.length - 4}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setMobileRailOpen(true)}
              aria-label="Team and activity"
              className="flex h-9 w-9 items-center justify-center rounded-card text-ink-muted hover:bg-canvas lg:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={notifOpen}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-card text-ink-muted hover:bg-canvas"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
                {unreadCount ? (
                  <span className="absolute right-1 top-1 h-[8px] w-[8px] rounded-full border-[1.5px] border-surface bg-danger" />
                ) : null}
              </button>

              {notifOpen ? (
                <>
                  <button
                    aria-label="Close notifications"
                    className="fixed inset-0 z-30"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div
                    ref={notifMenuRef}
                    role="menu"
                    aria-label="Notifications"
                    className="absolute right-0 top-10 z-40 w-[300px] overflow-hidden rounded-panel border border-border bg-surface shadow-pop"
                  >
                    <div className="flex items-center justify-between border-b border-border-soft px-3.5 py-2.5">
                      <p className="text-[14.5px] font-bold text-ink">Notifications</p>
                      {unreadCount ? (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-[13.5px] font-semibold text-accent"
                        >
                          Mark all read
                        </button>
                      ) : null}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-3.5 py-4 text-[13.5px] text-ink-faint">You&apos;re all caught up.</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {notifications.slice(0, 5).map((n) => (
                          <div key={n.id} className="flex gap-2 border-b border-border-soft px-3.5 py-2.5 last:border-0">
                            <span
                              className={`mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${n.unread ? "bg-accent" : "bg-transparent"}`}
                            />
                            <div className="text-[14px] leading-snug text-ink-muted">
                              <span className="text-ink">{notificationText(n)}</span>
                              <div className="mt-0.5 text-[13px] text-ink-faint">
                                {n.boardName} · {n.createdAt ? relativeTime(n.createdAt) : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <a
                      href="/notifications"
                      className="block px-3.5 py-2.5 text-center text-[13.5px] font-semibold text-accent hover:bg-canvas"
                    >
                      View all
                    </a>
                  </div>
                </>
              ) : null}
            </div>

            <a
              href="/settings"
              title={sessionUser.name}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white"
            >
              {sessionUser.initials}
            </a>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-2.5 px-4 pb-1.5 pt-3.5 sm:grid-cols-4 sm:gap-3 sm:px-6">
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

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <span className="mr-0.5 text-[13.5px] font-semibold text-ink-faint">Priority</span>
          {Object.entries(priorities).map(([id, p]) => (
            <Chip
              key={id}
              active={filterPriority === id}
              dotColor={p.color}
              onClick={() => setFilterPriority((cur) => (cur === id ? "" : id))}
            >
              {p.name}
            </Chip>
          ))}
          {boardLabels.length ? (
            <>
              <span className="ml-1.5 mr-0.5 text-[13.5px] font-semibold text-ink-faint">Labels</span>
              {boardLabels.map((label) => (
                <Chip
                  key={label}
                  active={filterLabel === label}
                  dotColor="#9CA0AF"
                  onClick={() => setFilterLabel((cur) => (cur === label ? "" : label))}
                >
                  {label}
                </Chip>
              ))}
            </>
          ) : null}
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            aria-label="Filter by assignee"
            className="rounded-full border border-border bg-surface px-2.5 py-[6px] text-[13.5px] font-semibold text-ink-muted focus:border-accent"
          >
            <option value="">Anyone</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[13.5px] font-bold text-accent"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p className="hidden px-4 pb-2 text-[13px] text-ink-faint sm:px-6 lg:block">
          Focus a card and press Enter to open it, or Space to pick it up and
          use the arrow keys to move it — Space again to drop it, Escape to
          cancel.
        </p>

        {actionError ? (
          <div className="px-4 pb-2 sm:px-6">
            <ErrorBanner
              message={actionError.message}
              onRetry={() => {
                const retry = actionError.onRetry;
                setActionError(null);
                retry?.();
              }}
            />
          </div>
        ) : null}

        {/* Board body */}
        {filtersActive && totalVisible === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[15px] font-medium text-ink">No cards match your filters</p>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-card border border-border bg-surface px-3.5 py-1.5 text-[14.5px] font-medium text-ink hover:bg-canvas"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto px-4 pb-4 sm:px-6">
            <div className="flex h-full items-start gap-3.5">
              {visibleListData.map((list, i) => (
                <div
                  key={list.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverListId(list.id);
                    // Only takes effect for "background" hover (empty
                    // space below the last card, or an empty list) —
                    // each CardItem's own onDragOverCard below stops this
                    // event from bubbling here while hovering a specific
                    // card, so it doesn't stomp on the more precise
                    // before/after target that handler just set.
                    setDropTarget({ listId: list.id, cardId: null, position: "end" });
                  }}
                  onDragLeave={(e) => {
                    // dragleave fires every time the pointer crosses a
                    // child element's boundary (cards, headers, etc.), not
                    // just when it truly leaves the list column. Ignore it
                    // unless we're moving to something outside this list,
                    // otherwise the highlight flickers on/off while
                    // dragging over cards.
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    setDragOverListId((id) => (id === list.id ? null : id));
                    setDropTarget((dt) => (dt?.listId === list.id ? null : dt));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(list.id);
                  }}
                  className={`flex w-[288px] shrink-0 flex-col rounded-panel border transition-colors ${
                    dragOverListId === list.id
                      ? "border-accent bg-accent-light/40"
                      : "border-border bg-canvas"
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }}
                    />
                    <h2 className="flex-1 truncate font-display text-[15px] font-bold text-ink">
                      {editingListId === list.id ? (
                        <input
                          autoFocus
                          value={editingListName}
                          onChange={(e) => setEditingListName(e.target.value)}
                          onBlur={() => handleRenameList(list.id, editingListName)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRenameList(list.id, editingListName);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingListId(null);
                            }
                          }}
                          disabled={renamingListId === list.id}
                          aria-label="List name"
                          className="w-full rounded-card border border-accent bg-surface px-1.5 py-0.5 font-display text-[15px] font-bold text-ink outline-none disabled:opacity-60"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingListId(list.id);
                            setEditingListName(list.name);
                          }}
                          title="Rename list"
                          disabled={renamingListId === list.id}
                          className="block w-full truncate rounded-card px-1.5 py-0.5 text-left hover:bg-border-soft disabled:opacity-60"
                        >
                          {list.name}
                        </button>
                      )}
                    </h2>
                    <span className="rounded-full bg-border-soft px-[9px] py-[2px] text-[13px] font-bold text-ink-muted">
                      {filtersActive ? `${list.visibleCardIds.length}/${list.cardIds.length}` : list.cardIds.length}
                    </span>
                    {/* DELETE /api/lists/:id is OWNER/ADMIN only per the
                        doc (rename, i.e. PATCH, is open to MEMBERs too —
                        no gate needed there). Hide the control rather
                        than let a MEMBER hit a 403 after confirming. */}
                    {workspaceRole === "OWNER" || workspaceRole === "ADMIN" ? (
                      <button
                        type="button"
                        onClick={() => setDeletingListId(list.id)}
                        aria-label={`Delete list ${list.name}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card text-ink-faint hover:bg-danger-light hover:text-danger"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1A2 2 0 0 1 14.2 21H9.8a2 2 0 0 1-2-1.9L7 7h10Z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2">
                    {list.visibleCardIds.length === 0 ? (
                      <div
                        className={`rounded-card px-3 py-4 text-center text-[13.5px] leading-relaxed transition-colors ${
                          draggingCardId && dropTarget?.listId === list.id && dropTarget.position === "end"
                            ? "border-2 border-dashed border-accent bg-accent-light/40 text-accent"
                            : "text-ink-faint"
                        }`}
                      >
                        {filtersActive
                          ? "No matching cards in this list."
                          : "Nothing here yet — drag a card over or add one below."}
                      </div>
                    ) : (
                      list.visibleCardIds.flatMap((cardId) => {
                        const card = board.cards[cardId];
                        if (!card) return [];

                        // Thin accent line showing exactly where the
                        // dragged card would land, driven by dropTarget
                        // (set from each card's onDragOverCard below) —
                        // this is what actually lets a mouse drag insert
                        // a card between two others instead of only ever
                        // appending to the end of whichever list it's
                        // dropped on.
                        const showBefore =
                          draggingCardId &&
                          draggingCardId !== cardId &&
                          dropTarget?.listId === list.id &&
                          dropTarget.cardId === cardId &&
                          dropTarget.position === "before";
                        const showAfter =
                          draggingCardId &&
                          draggingCardId !== cardId &&
                          dropTarget?.listId === list.id &&
                          dropTarget.cardId === cardId &&
                          dropTarget.position === "after";

                        const nodes = [];
                        if (showBefore) {
                          nodes.push(
                            <div
                              key={`${cardId}-drop-before`}
                              aria-hidden="true"
                              className="h-[3px] shrink-0 rounded-full bg-accent"
                            />
                          );
                        }
                        nodes.push(
                          <CardItem
                            key={cardId}
                            card={card}
                            dragging={draggingCardId === cardId}
                            pickedUp={keyboardMove?.cardId === cardId}
                            moveInProgress={Boolean(keyboardMove)}
                            elRef={(el) => {
                              if (el) cardRefs.current[cardId] = el;
                              else delete cardRefs.current[cardId];
                            }}
                            onDragStart={() => setDraggingCardId(cardId)}
                            onDragEnd={() => {
                              setDraggingCardId(null);
                              setDragOverListId(null);
                              setDropTarget(null);
                            }}
                            onDragOverCard={(e) => {
                              // Ignore hovering the card currently being
                              // dragged (it's still in the DOM, just
                              // dimmed) — nothing meaningful to compute
                              // relative to itself.
                              if (!draggingCardId || draggingCardId === cardId) return;
                              e.preventDefault();
                              // Stop this dragover from also bubbling up
                              // to the list container's own handler,
                              // which would otherwise immediately
                              // overwrite this precise before/after
                              // target with a generic "end of list" one.
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const isBefore = e.clientY < rect.top + rect.height / 2;
                              setDragOverListId(list.id);
                              setDropTarget({
                                listId: list.id,
                                cardId,
                                position: isBefore ? "before" : "after",
                              });
                            }}
                            onOpen={() => setOpenCard({ cardId, listId: list.id })}
                            onKeyDown={(e) => handleCardKeyDown(e, card, list.id)}
                          />
                        );
                        if (showAfter) {
                          nodes.push(
                            <div
                              key={`${cardId}-drop-after`}
                              aria-hidden="true"
                              className="h-[3px] shrink-0 rounded-full bg-accent"
                            />
                          );
                        }
                        return nodes;
                      })
                    )}
                    {list.visibleCardIds.length > 0 &&
                    draggingCardId &&
                    dropTarget?.listId === list.id &&
                    dropTarget.position === "end" ? (
                      <div aria-hidden="true" className="h-[3px] shrink-0 rounded-full bg-accent" />
                    ) : null}
                  </div>

                  <div className="px-2.5 pb-2.5">
                    {composingListId === list.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddCard(list.id);
                        }}
                      >
                        <textarea
                          autoFocus
                          value={newCardTitle}
                          onChange={(e) => setNewCardTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleAddCard(list.id);
                            }
                            if (e.key === "Escape") {
                              setComposingListId(null);
                              setNewCardTitle("");
                            }
                          }}
                          placeholder="Enter a title for this card..."
                          rows={2}
                          className="w-full rounded-card border border-border bg-surface px-2.5 py-2 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-accent"
                        />
                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            type="submit"
                            className="rounded-card bg-accent px-3 py-1.5 text-[14px] font-medium text-white hover:bg-accent-dark"
                          >
                            Add card
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setComposingListId(null);
                              setNewCardTitle("");
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-card text-ink-faint hover:bg-canvas"
                            aria-label="Cancel"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setComposingListId(list.id);
                          setNewCardTitle("");
                        }}
                        className="flex w-full items-center gap-1.5 rounded-card px-2 py-1.5 text-left text-[14px] font-semibold text-ink-muted hover:bg-border-soft hover:text-ink"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                        Add card
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="w-[200px] shrink-0">
                {addingListOpen ? (
                  <form
                    onSubmit={handleAddList}
                    className="rounded-panel border border-border bg-canvas p-2.5"
                  >
                    <input
                      autoFocus
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setAddingListOpen(false);
                          setNewListName("");
                        }
                      }}
                      placeholder="List name..."
                      className="w-full rounded-card border border-border bg-surface px-2.5 py-2 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-accent"
                    />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="submit"
                        className="rounded-card bg-accent px-3 py-1.5 text-[14px] font-medium text-white hover:bg-accent-dark"
                      >
                        Add list
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingListOpen(false);
                          setNewListName("");
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-card text-ink-faint hover:bg-canvas"
                        aria-label="Cancel"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingListOpen(true)}
                    className="flex w-full items-center gap-1.5 rounded-card border border-dashed border-border px-3 py-2.5 text-left text-[14.5px] font-semibold text-ink-faint hover:border-accent hover:text-accent-dark"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Add another list
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile team/activity sheet */}
      {mobileRailOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close panel"
            onClick={() => setMobileRailOpen(false)}
            className="absolute inset-0 bg-ink-900/50"
          />
          <div ref={mobileRailRef} className="absolute inset-y-0 right-0 w-[280px] max-w-[85%] overflow-y-auto bg-surface px-4 py-[20px] shadow-pop" role="dialog" aria-modal="true" aria-label="Team and activity">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14.5px] font-bold text-ink">Team &amp; activity</p>
              <button
                type="button"
                onClick={() => setMobileRailOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-card text-ink-faint hover:bg-canvas"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <TeamAndActivity teamRail={teamRail} loadByMember={loadByMember} recentActivity={boardActivity} teamMembers={teamMembers} />
          </div>
        </div>
      ) : null}

      {/* Desktop right rail: team + activity */}
      <div className="hidden w-[264px] shrink-0 overflow-y-auto border-l border-border bg-surface px-4 py-[20px] lg:block">
        <TeamAndActivity teamRail={teamRail} loadByMember={loadByMember} recentActivity={boardActivity} teamMembers={teamMembers} />
      </div>

      {openCard && board.cards[openCard.cardId] ? (
        <CardModal
          card={board.cards[openCard.cardId]}
          listName={board.lists.find((l) => l.id === openCard.listId)?.name || ""}
          listId={openCard.listId}
          lists={board.lists.map((l) => ({ id: l.id, name: l.name }))}
          members={workspaceMembers}
          liveComment={liveComment}
          onClose={() => setOpenCard(null)}
          onSave={handleSaveCard}
          // DELETE /api/cards/:id is OWNER/ADMIN only per the doc (regular
          // MEMBERs can edit/move a card but not delete it). Hide the
          // affordance rather than let a MEMBER hit a 403 after
          // confirming — same pattern as the board/list delete gates
          // above.
          onDelete={
            workspaceRole === "OWNER" || workspaceRole === "ADMIN"
              ? () => handleDeleteCard(openCard.cardId).then(() => setOpenCard(null))
              : undefined
          }
        />
      ) : null}

      {deletingListId ? (
        <ConfirmModal
          title={`Delete "${board.lists.find((l) => l.id === deletingListId)?.name || "this list"}"?`}
          description="This permanently deletes the list and every card in it. This can't be undone."
          confirmLabel="Delete list"
          confirmingLabel="Deleting..."
          onClose={() => setDeletingListId(null)}
          onConfirm={() => handleDeleteList(deletingListId)}
        />
      ) : null}

      {editingBoardInfo ? (
        <BoardEditModal
          board={board}
          onClose={() => setEditingBoardInfo(false)}
          onSave={handleSaveBoardInfo}
        />
      ) : null}

      {deletingBoardConfirm ? (
        <ConfirmModal
          title={`Delete "${board.name}"?`}
          description="This permanently deletes the board and all of its lists and cards. This can't be undone."
          confirmLabel="Delete board"
          confirmingLabel="Deleting..."
          onClose={() => setDeletingBoardConfirm(false)}
          onConfirm={handleConfirmDeleteBoard}
        />
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Announces keyboard card-move status to screen readers. */}
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

function TeamAndActivity({ teamRail, loadByMember, recentActivity, teamMembers }) {
  return (
    <>
      <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-ink-faint">Team</p>
      <div className="space-y-0.5">
        {teamRail.map((m) => (
          <div key={m.id} className="flex items-center gap-2.5 rounded-card px-1.5 py-[8px]">
            <span
              className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ backgroundColor: m.color }}
            >
              {m.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">{m.name}</p>
              {/* Backend roles come back upper-case (OWNER/ADMIN/MEMBER) —
                  title-case for display, same convention as app/members/page.js. */}
              <p className="text-[12.5px] text-ink-faint">
                {m.role ? m.role.charAt(0) + m.role.slice(1).toLowerCase() : ""}
              </p>
            </div>
            <span className="rounded-full bg-canvas px-[9px] py-[2px] text-[13px] font-bold text-ink-muted">
              {loadByMember[m.id] || 0}
            </span>
          </div>
        ))}
      </div>

      <div className="my-4 h-px bg-border-soft" />

      <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-ink-faint">Activity</p>
      {recentActivity.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-ink-faint">
          Updates on this board will show up here.
        </p>
      ) : (
        <div className="space-y-2.5">
          {recentActivity.map((a, i) => {
            // `action` is the documented field and already reads as a full
            // sentence ("Ayomide moved card ..."), so it's rendered as-is
            // with no author name prefixed in front of it. The fallbacks
            // below only kick in for an entry that's missing `action`
            // entirely, reconstructing from actor + a generic verb rather
            // than showing nothing.
            const timestamp = a.createdAt ?? a.timestamp ?? a.occurredAt;
            const action = a.action;
            const fallbackAuthorId = a.userId ?? a.actorId ?? a.authorId;
            const fallbackAuthor = teamMembers.find((m) => m.id === fallbackAuthorId);
            return (
              <div key={a.id ?? i} className="flex items-start gap-2">
                <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                <div className="text-[13.5px] leading-relaxed text-ink-muted">
                  {action ? (
                    action
                  ) : (
                    <>
                      <strong className="font-semibold text-ink">{fallbackAuthor?.name || "Someone"}</strong>{" "}
                      made a change
                    </>
                  )}
                  {timestamp ? (
                    <div className="mt-0.5 text-[12.5px] text-ink-faint">{relativeTime(timestamp)}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
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

function Chip({ children, active, dotColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[13.5px] font-semibold transition-colors ${
        active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-border bg-surface text-ink-muted hover:border-ink-faint"
      }`}
    >
      <span className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: dotColor }} />
      {children}
    </button>
  );
}
