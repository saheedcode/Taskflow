"use client";

// API layer for TaskFlow.
//
// Workspaces, members, boards (including the workspace board listing),
// lists, cards (including priority), comments, and notifications below
// are all migrated to the real backend — see the API doc this was built
// against. Labels have no backend entity at all (cards just carry a
// free-text `labels: string[]`, edited directly on the card — see
// updateCard). `priority` IS a real persisted field now
// (`"LOW"|"MED"|"HIGH"|"CRITICAL"` on the wire); this file stores/reads
// it lowercase (`low|med|high|critical`) everywhere else in the app —
// see toBackendPriority/fromBackendPriority in lib/priorities.js and the
// Cards section below for the boundary conversion.
//
// Two conventions carried through the migration:
//   - Real backend IDs are UUID strings, always taken from the backend
//     response, never generated client-side (no more
//     `c_${Date.now().toString(36)}`-style ids for anything migrated).
//   - Real `position` fields are floats used for insert-between reordering
//     (e.g. `1.5` between `1` and `2`). Lists and card moves both read/
//     write this real field through the ONE shared helper in
//     lib/reorder.js (computeReorderPosition / computePositionBetween /
//     sortByPosition) — no array-index or renumber-the-whole-array logic
//     remains anywhere in this file or in KanbanBoard.js, including card
//     creation (see createCard), which computes a real append position
//     through that same helper rather than inventing its own scheme.
//     normalizeBoard() (below) also sorts lists/cards by position on
//     every fetch, so a freshly loaded board always reflects whatever
//     was last persisted, not just the order the backend happened to
//     return.

import {
  workspaces as seedWorkspaces,
  boardDetails as seedBoardDetails,
} from "./mockData";
import { apiFetch, getStoredUser } from "./apiClient";
import { computeReorderPosition, sortByPosition } from "./reorder";
import { toBackendPriority, fromBackendPriority } from "./priorities";

const BOARD_DETAILS_KEY = "tf_board_details";

// These two are intentionally NOT named ApiError/NotFoundError — that name
// belongs to lib/apiClient.js's ApiError, which carries a real `err.status`
// from the backend. These are purely mock-layer stand-ins, still used by
// the notifications section below and as client-side validation errors
// (e.g. "name can't be empty") ahead of a real network call in migrated
// sections — either way, no real backend produced them, so they can't
// carry a real status code. MockNotFoundError is a miss against the
// localStorage seed data, standing in for a real 404.
export class MockApiError extends Error {}
export class MockNotFoundError extends Error {}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function read(key, seed) {
  if (typeof window === "undefined") return clone(seed);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt or unreadable — fall through and reseed below.
  }
  const seeded = clone(seed);
  localStorage.setItem(key, JSON.stringify(seeded));
  return seeded;
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Workspaces (real backend: GET/POST /api/workspaces, PATCH/DELETE
// /api/workspaces/:id) ----
//
// A person can belong to several workspaces and switch between them (the
// switcher lives in NavContent.js). The backend has no concept of a
// "current" or "default" workspace — GET /api/workspaces just returns the
// unordered set the user belongs to — so which one is active lives
// entirely client-side, in `tf_active_workspace` in localStorage, exactly
// as the old mock did. `fetchWorkspace()` (singular) and
// `switchWorkspace()` below are pure client-side logic layered on top of
// the real `fetchWorkspaces()` list; there's no matching endpoint for
// either and none should be invented.
const ACTIVE_WORKSPACE_KEY = "tf_active_workspace";

// In-memory cache of the last successful GET /api/workspaces response, so
// (a) readActiveWorkspaceId() below can resolve synchronously without an
// await, the way boards/board-creation elsewhere in this file need it to,
// and (b) fetchWorkspace()/switchWorkspace() don't have to refetch the
// whole list for something with no backend endpoint of its own.
let cachedWorkspaces = [];
let workspacesInFlight = null;

function readActiveWorkspaceId() {
  if (typeof window === "undefined") return cachedWorkspaces[0]?.id ?? null;
  try {
    const stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    // Trust a stored id even before the list has loaded (likely valid from
    // last session); once the list is loaded, require it to still exist —
    // it may have been deleted (by this user or another admin) since.
    if (stored && (!cachedWorkspaces.length || cachedWorkspaces.some((w) => w.id === stored))) {
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to the default below.
  }
  return cachedWorkspaces[0]?.id ?? null;
}

function setActiveWorkspaceId(workspaceId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    // Storage unavailable — the choice just won't persist across reloads.
  }
  window.dispatchEvent(new CustomEvent("tf:workspace-changed", { detail: { workspaceId } }));
}

// Synchronous — used by things that need the id without an await (e.g.
// deciding whether a workspace-changed event affects the current view,
// or the still-fake board functions further down this file).
export function getActiveWorkspaceId() {
  return readActiveWorkspaceId();
}

export async function fetchWorkspaces() {
  // Dedupe concurrent callers (e.g. NavContent and a page both mounting
  // at once) into a single network request instead of firing GET
  // /api/workspaces twice.
  if (workspacesInFlight) return workspacesInFlight;

  workspacesInFlight = apiFetch("/api/workspaces").then((list) => {
    cachedWorkspaces = Array.isArray(list) ? list : [];

    // No backend endpoint returns a "default" workspace, so the first
    // time we ever see a list (or if the previously-active one no longer
    // exists — e.g. it was deleted), pick the first one client-side so
    // every workspace-scoped view has something to resolve against
    // before the person explicitly switches.
    if (typeof window !== "undefined" && cachedWorkspaces.length) {
      let stored = null;
      try {
        stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      } catch {
        // Storage unavailable — treat as unset below.
      }
      const storedIsValid = stored && cachedWorkspaces.some((w) => w.id === stored);
      if (!storedIsValid) setActiveWorkspaceId(cachedWorkspaces[0].id);
    }

    return cachedWorkspaces;
  });

  try {
    return await workspacesInFlight;
  } finally {
    workspacesInFlight = null;
  }
}

// Returns the currently active workspace (includes `role`, since the
// backend mixes it into every entry of GET /api/workspaces). Existing
// callers that only know about a single workspace (settings page, board
// breadcrumb, etc.) keep working unchanged — this just resolves to
// whichever one is active. No backend equivalent — see note above.
export async function fetchWorkspace() {
  if (!cachedWorkspaces.length) {
    await fetchWorkspaces();
  }
  if (!cachedWorkspaces.length) {
    // Genuinely zero workspaces on this account (e.g. brand-new user who
    // hasn't created one yet). Every existing caller of fetchWorkspace()
    // already does `.catch(() => {})` and keeps showing its last-known
    // fallback, so throw here rather than resolving to null/undefined and
    // crashing on `.name` wherever a caller assumes a workspace exists.
    throw new MockNotFoundError("You don't have any workspaces yet.");
  }
  const activeId = readActiveWorkspaceId();
  return cachedWorkspaces.find((w) => w.id === activeId) || cachedWorkspaces[0];
}

// Renames a specific workspace. Requires OWNER or ADMIN role in it —
// callers should gate the UI on `workspace.role` rather than relying on
// the 403 alone.
export async function renameWorkspace(workspaceId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new MockApiError("Workspace name can't be empty.");
  const updated = await apiFetch(`/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: { name: trimmed },
  });
  cachedWorkspaces = cachedWorkspaces.map((w) => (w.id === workspaceId ? { ...w, ...updated } : w));
  return updated;
}

// Back-compat wrapper the settings page uses — renames whichever
// workspace is currently active.
export async function updateWorkspaceName(name) {
  const activeId = readActiveWorkspaceId();
  if (!activeId) throw new MockApiError("No active workspace to rename.");
  return renameWorkspace(activeId, name);
}

// Deletes a workspace. Requires OWNER role; cascades to every board/list/
// card/comment underneath it on the backend. Callers MUST confirm with
// the person before calling this — there is no undo.
export async function deleteWorkspace(workspaceId) {
  await apiFetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
  cachedWorkspaces = cachedWorkspaces.filter((w) => w.id !== workspaceId);

  if (typeof window !== "undefined") {
    let stored = null;
    try {
      stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    } catch {
      // Storage unavailable.
    }
    if (stored === workspaceId) {
      const fallback = cachedWorkspaces[0]?.id;
      if (fallback) {
        setActiveWorkspaceId(fallback);
      } else {
        try {
          localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        } catch {
          // Storage unavailable.
        }
        window.dispatchEvent(new CustomEvent("tf:workspace-changed", { detail: { workspaceId: null } }));
      }
    }
  }

  return { ok: true };
}

// Switches the active workspace and tells the rest of the app about it.
// Components that show workspace-scoped data (the boards grid, the nav
// switcher, the board breadcrumb) listen for "tf:workspace-changed" and
// refetch rather than requiring a full page reload. No backend
// equivalent — purely client-side, same as fetchWorkspace() above.
export async function switchWorkspace(workspaceId) {
  const target = cachedWorkspaces.find((w) => w.id === workspaceId);
  if (!target) throw new MockNotFoundError("Workspace not found.");
  setActiveWorkspaceId(workspaceId);
  return target;
}

export async function createWorkspace(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new MockApiError("Workspace name can't be empty.");
  const ws = await apiFetch("/api/workspaces", { method: "POST", body: { name: trimmed } });
  // Doc guarantees the creator becomes OWNER; default it in case the POST
  // response body itself doesn't restate `role` the way the GET list does,
  // so rename/delete UI works immediately without waiting on a refetch.
  const withRole = { role: "OWNER", ...ws };
  cachedWorkspaces = [...cachedWorkspaces, withRole];
  return withRole;
}

// ---- Members (real backend: GET /api/workspaces/:id/members, POST
// /api/workspaces/:id/invite) ----
//
// GAPS (flagged per the migration doc, not worked around client-side):
//   - No endpoint to change a member's role after they join. There is no
//     updateMemberRole() here anymore — the members page shows role as a
//     read-only badge.
//   - No endpoint to remove a member from a workspace. There is no
//     removeMember() here anymore.
//   - Invites don't take a role — POST .../invite only accepts email, and
//     new members always land as MEMBER. inviteMember() below reflects
//     that; there's no role parameter to pass.

export async function fetchMembers(workspaceId) {
  const id = workspaceId || readActiveWorkspaceId();
  if (!id) throw new MockApiError("No active workspace selected.");
  const list = await apiFetch(`/api/workspaces/${id}/members`);
  // Already sorted alphabetically by the backend — don't re-sort here.
  return Array.isArray(list) ? list : [];
}

// Invites someone by email to a workspace. The backend responds
// differently depending on whether that email already has an account:
//   - 201: they're added immediately — apiFetch resolves with the new
//     membership object, which has a `role`.
//   - 202: no account yet — a pending invite is emailed, and apiFetch
//     resolves with just `{ message }` (no `role`).
// apiFetch doesn't surface the raw status code, so the two outcomes are
// distinguished by response shape instead (reliable, since only the 201
// membership object carries `role`). Callers should show these two cases
// differently rather than a single generic "invited" toast.
export async function inviteMember(email, workspaceId) {
  const id = workspaceId || readActiveWorkspaceId();
  if (!id) throw new MockApiError("No active workspace selected.");
  const trimmed = (email || "").trim();
  if (!trimmed) throw new MockApiError("Enter an email address.");

  const result = await apiFetch(`/api/workspaces/${id}/invite`, {
    method: "POST",
    body: { email: trimmed },
  });

  if (result && result.role) {
    return { status: "added", member: result };
  }
  return {
    status: "pending",
    message: result?.message || "Invite sent — they will be added once they sign up.",
  };
}

// ---- Workspace-wide card search (real backend: GET
// /api/workspaces/:id/search) ----
//
// This is the one search endpoint that actually needs the backend — the
// frontend never has every board's cards loaded at once the way it does
// for a single open board (see GET /api/boards/:id). All params are
// optional and AND-combine server-side: q (title/description substring,
// case-insensitive), assigneeId, label (exact match against a card's
// labels array), dueBefore/dueAfter (ISO date strings). Results come
// back as a flat array, most-recently-updated first, each one already
// carrying its listId/listName/boardId/boardName so the UI can link back
// to where the card actually lives without a second fetch.
//
// The endpoint now paginates server-side: `limit` (default 25, capped at
// 100) and `offset` (default 0) are accepted alongside the filters
// below, and the response is a `{ items, total, hasMore }` envelope
// instead of a bare array — a breaking change from the earlier version
// of this doc. `total` is the full match count across the whole
// workspace (not just this page) and `hasMore` tells you whether another
// page exists — callers should use that instead of guessing from
// `items.length === limit`. Each item's `priority` is converted to this
// app's lowercase local id the same way board/card fetches do (see
// lib/priorities.js).
export async function searchWorkspace(workspaceId, filters = {}) {
  const id = workspaceId || readActiveWorkspaceId();
  if (!id) throw new MockApiError("No active workspace selected.");

  const params = new URLSearchParams();
  const { q, assigneeId, label, dueBefore, dueAfter, limit, offset } = filters;
  if (q && q.trim()) params.set("q", q.trim());
  if (assigneeId) params.set("assigneeId", assigneeId);
  if (label && label.trim()) params.set("label", label.trim());
  if (dueBefore) params.set("dueBefore", dueBefore);
  if (dueAfter) params.set("dueAfter", dueAfter);
  if (limit) params.set("limit", limit);
  if (offset) params.set("offset", offset);

  const qs = params.toString();
  const response = await apiFetch(`/api/workspaces/${id}/search${qs ? `?${qs}` : ""}`);
  const items = Array.isArray(response?.items) ? response.items : [];

  return {
    items: items.map((card) => ({ ...card, priority: fromBackendPriority(card.priority) })),
    total: typeof response?.total === "number" ? response.total : items.length,
    hasMore: Boolean(response?.hasMore),
  };
}

// ---- Notifications (real backend: GET /api/notifications, PATCH
// /api/notifications/:id/read, PATCH /api/notifications/read-all) ----
//
// Migrated off the mock localStorage layer. Shape from the backend:
//   { id, unread, actorId, verb, cardId, cardTitle, boardId, boardName, createdAt }
// with `verb` one of "assigned_card" | "mentioned" | "due_soon" — see
// lib/notificationText.js for the verb -> copy mapping consumers should
// use rather than rendering `verb` or `actorId` directly. For
// `due_soon`, `actorId` is null (the scheduled reminder job, not a
// user's action) — notificationText.js already accounts for that.

export async function fetchNotifications() {
  const list = await apiFetch("/api/notifications");
  return Array.isArray(list) ? list : [];
}

// Per the doc, this endpoint returns the FULL updated notification list,
// not just the one notification that was marked read — callers should
// use that returned list as their new state directly rather than
// patching the single item into whatever list they already had (that's
// also why this doesn't take/return a bare boolean or single object).
export async function markNotificationRead(id) {
  const list = await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  return Array.isArray(list) ? list : [];
}

export async function markAllNotificationsRead() {
  const list = await apiFetch("/api/notifications/read-all", { method: "PATCH" });
  return Array.isArray(list) ? list : [];
}

// ---- Boards (real backend: POST /api/boards, GET/PATCH/DELETE
// /api/boards/:id, GET /api/boards/:id/activity, GET
// /api/workspaces/:id/boards) ----
//
// GET /api/workspaces/:id/boards is now a real endpoint (the earlier
// version of this doc had no "list boards in a workspace" call at all,
// which is why fetchBoards() used to derive a board list from
// workspace-search results — that workaround, its BOARDS_KEY shadow
// cache, and the BOARDS_LIST_IS_DERIVED banner flag are gone; see git
// history if any of that reasoning is ever needed again). The real
// endpoint returns `cardCount` computed server-side (so a zero-card
// board correctly shows up, unlike the old derivation) plus `description`
// and `color`, sorted most-recently-updated first.
//
// It does NOT return a `members` list per board (no board-level members
// endpoint exists — only the workspace-level GET
// /api/workspaces/:id/members) or a "done vs. total" progress figure, so
// those stay `[]` / `progressKnown: false` here; BoardCard already
// renders gracefully for both (hides the status pill/progress bar, shows
// no avatar row).
const DERIVED_COLOR_PALETTE = ["#1F6F78", "#C99A3E", "#E2673B", "#3F8F5F", "#5B6570", "#B23A3A"];

// Deterministic hash -> palette index, used as a fallback so a board
// with no `color` set still gets a distinct-looking tile instead of
// every untinted board rendering identically.
function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) {
    hash = (hash * 31 + String(id).charCodeAt(i)) >>> 0;
  }
  return DERIVED_COLOR_PALETTE[hash % DERIVED_COLOR_PALETTE.length];
}

// Backend `updatedAt` is an ISO timestamp; BoardCard wants a short
// human label ("Just now", "3h ago", "5d ago"). No relative-time
// library is in package.json, so this stays a small inline helper
// rather than pulling one in for a single call site.
function relativeTimeFrom(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export async function fetchBoards() {
  const workspaceId = readActiveWorkspaceId();
  if (!workspaceId) throw new MockApiError("No active workspace selected.");

  const boards = await apiFetch(`/api/workspaces/${workspaceId}/boards`);
  const list = Array.isArray(boards) ? boards : [];

  return list.map((b) => ({
    id: b.id,
    name: b.title ?? b.name ?? "Untitled board",
    description: b.description || "",
    color: b.color || colorFromId(b.id),
    cardCount: b.cardCount ?? 0,
    members: [],
    progressKnown: false,
    updatedAt: relativeTimeFrom(b.updatedAt),
    workspaceId,
  }));
}

// The backend calls the board's name `title` (POST /api/boards takes
// `{ title, workspaceId }`) — translated to/from the UI's `name` field
// here so the rest of the app (BoardCard, NewBoardModal, KanbanBoard...)
// doesn't have to know about that naming difference.
//
// `description` and `color` are both documented, optional fields on
// board creation — omitting either stores it as `null` server-side.
// fetchBoards() now reads straight from GET /api/workspaces/:id/boards,
// so there's no shadow cache to keep in sync here anymore; this just
// creates the board and seeds the BOARD_DETAILS_KEY bridge the
// still-local cards layer below reads/writes.
export async function createBoard({ name, description, color }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new MockApiError("Board name can't be empty.");
  const workspaceId = readActiveWorkspaceId();
  if (!workspaceId) throw new MockApiError("No active workspace selected.");

  const created = await apiFetch("/api/boards", {
    method: "POST",
    body: { title: trimmed, workspaceId, description, color },
  });

  // The person creating the board is always its first known member —
  // GET /api/workspaces/:id/boards returns no members list at all (see
  // the note above), so this is the only member data a freshly created
  // board has until a page that loads real workspace members (the board
  // view, the members page) is visited. Sourced from the real stored
  // session (set at login/signup — see lib/apiClient.js), not a
  // fabricated placeholder.
  const sessionUser = getStoredUser();
  const summary = {
    id: created.id,
    name: created.title ?? trimmed,
    description: created.description ?? description ?? "",
    color: created.color ?? color ?? colorFromId(created.id),
    cardCount: 0,
    members: sessionUser
      ? [
          {
            id: sessionUser.id,
            name: sessionUser.name,
            initials: sessionUser.initials,
            color: colorFromId(sessionUser.id),
          },
        ]
      : [],
    progressKnown: false,
    updatedAt: "Just now",
    workspaceId,
  };

  // Bridge for the still-local cards layer below (createCard, moveCard,
  // etc.): seed an empty entry keyed by the real board id so those
  // functions have somewhere to write.
  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  write(BOARD_DETAILS_KEY, {
    ...details,
    [created.id]: { id: created.id, name: summary.name, color: summary.color, lists: [], cards: {} },
  });

  return summary;
}

// PATCH /api/boards/:id — OWNER/ADMIN/MEMBER can call this (unlike
// delete, which is OWNER/ADMIN only — see deleteBoard below). Same
// title/name translation as createBoard above; description/color are
// both real, persisted fields, so the response is trusted directly with
// no local shadow-cache upsert needed anymore.
export async function updateBoard(boardId, { name, description, color }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new MockApiError("Board name can't be empty.");

  const updated = await apiFetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: { title: trimmed, description, color },
  });

  const nextSummary = {
    name: updated.title ?? trimmed,
    description: updated.description ?? description ?? "",
    color: updated.color ?? color,
  };

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  if (details[boardId]) {
    details[boardId] = { ...details[boardId], name: nextSummary.name, color: nextSummary.color };
    write(BOARD_DETAILS_KEY, details);
  }

  return { id: boardId, ...nextSummary };
}

// DELETE /api/boards/:id — OWNER/ADMIN only per the doc; cascades to
// every list/card/comment underneath it server-side. Callers MUST
// confirm with the person first — there is no undo (KanbanBoard's board
// settings menu and the workspace grid both already gate this behind
// ConfirmModal).
export async function deleteBoard(boardId) {
  await apiFetch(`/api/boards/${boardId}`, { method: "DELETE" });

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const { [boardId]: _discard, ...rest } = details;
  write(BOARD_DETAILS_KEY, rest);

  return { ok: true };
}

// GET /api/boards/:id/activity — most-recent-first. Exact field names
// on each entry aren't spelled out in the doc excerpt we're building
// against (notifications' `verb`/`actorId` shape was documented, this
// wasn't) — TeamAndActivity in KanbanBoard.js renders defensively
// (falls back gracefully on whatever fields are actually present)
// rather than assuming one shape. Verify field names against the doc
// and tighten that rendering once confirmed.
export async function fetchBoardActivity(boardId) {
  const list = await apiFetch(`/api/boards/${boardId}/activity`);
  return Array.isArray(list) ? list : [];
}

// ---- Board detail (lists + cards) ----
//
// GET /api/boards/:id is the real backend endpoint per the doc — it
// returns lists with their cards nested inside each list, and that's the
// only call needed to load a board (no separate lists/cards fetches).
// normalizeBoard() below reshapes that nested response into the
// {id, name, lists: [{id, name, cardIds}], cards: {id: card}} internal
// shape KanbanBoard.js already expects, rather than restructuring every
// consumer of fetchBoard() around the raw nested response.
//
// Card-level fields (labelIds vs. a plain `labels` field, etc.) are a
// separate migration concern — full card CRUD against real endpoints
// isn't wired yet, so this normalization is deliberately shallow: it
// preserves whatever fields the backend sends on each card rather than
// trying to fully reshape them ahead of that migration.
//
// `position` IS load-bearing here, though: the doc doesn't guarantee
// GET /api/boards/:id returns lists or their nested cards pre-sorted by
// `position`, so both are explicitly sorted with the shared
// sortByPosition helper (lib/reorder.js — the same one drag-and-drop
// and keyboard-move use to re-derive order after a move) before being
// turned into the {cardIds: [...]} shape the rest of the app renders
// from. Skipping this would mean a freshly loaded/refreshed board could
// visually disagree with the position values a previous reorder
// actually persisted.
function normalizeBoard(apiBoard) {
  const lists = Array.isArray(apiBoard.lists) ? apiBoard.lists : [];
  const cards = {};
  const normalizedLists = sortByPosition(lists).map((list) => {
    const listCards = sortByPosition(Array.isArray(list.cards) ? list.cards : []).map((card) => ({
      ...card,
      priority: fromBackendPriority(card.priority),
    }));
    listCards.forEach((card) => {
      cards[card.id] = card;
    });
    return {
      id: list.id,
      name: list.title ?? list.name,
      position: list.position,
      cardIds: listCards.map((c) => c.id),
    };
  });

  return {
    id: apiBoard.id,
    name: apiBoard.title ?? apiBoard.name,
    color: apiBoard.color,
    workspaceId: apiBoard.workspaceId,
    lists: normalizedLists,
    cards,
  };
}

export async function fetchBoard(boardId) {
  const board = normalizeBoard(await apiFetch(`/api/boards/${boardId}`));

  // Bridge for the still-mock card functions further down this file
  // (createCard, moveCard, updateCard, etc. — real endpoints land in a
  // later migration part): mirror the freshly-fetched real board into the
  // same localStorage store those functions read/write, keyed by the
  // real board id, so card edits keep working locally in the meantime
  // instead of throwing MockNotFoundError against a board id the seed
  // data doesn't have. List CRUD (createList/updateList/deleteList,
  // below) is real now and no longer needs this bridge for its own
  // writes, but still keeps this store in sync since cards read board
  // structure from it.
  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  write(BOARD_DETAILS_KEY, { ...details, [board.id]: board });

  return board;
}

// ---- Lists (real backend: POST /api/boards/:id/lists, PATCH
// /api/lists/:id, DELETE /api/lists/:id) ----
//
// Migrated off the mock layer. Cards still read/write the BOARD_DETAILS_KEY
// bridge (see fetchBoard above), so every list function below keeps that
// local mirror in sync after a successful backend call rather than
// requiring a full board refetch for the change to show up.
//
// There's no reorder-list UI yet, so createList always computes an
// append position (via the shared computeReorderPosition helper in
// lib/reorder.js — the same one card reordering below and in
// KanbanBoard.js's client-side moveCard use). updateList's `position`
// param exists so a future reorder-list feature has a single PATCH call
// to land on rather than needing a second one.

function normalizeList(apiList) {
  return {
    id: apiList.id,
    name: apiList.title ?? apiList.name,
    position: apiList.position,
    cardIds: Array.isArray(apiList.cards) ? apiList.cards.map((c) => c.id) : [],
  };
}

export async function createList(boardId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new MockApiError("List name can't be empty.");

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  const siblingPositions = (board?.lists || []).map((l) => l.position);
  const position = computeReorderPosition(siblingPositions, siblingPositions.length);

  const created = await apiFetch(`/api/boards/${boardId}/lists`, {
    method: "POST",
    body: { title: trimmed, position },
  });
  const list = normalizeList(created);

  if (board) {
    board.lists = [
      ...board.lists,
      { id: list.id, name: list.name, position: list.position, cardIds: [] },
    ];
    write(BOARD_DETAILS_KEY, details);
  }

  return list;
}

// PATCH /api/lists/:id — takes either/both { title, position }. Only
// title is sent today (via the renameList wrapper below); a future
// reorder feature should pass `position` through this same function
// rather than adding a second PATCH call.
export async function updateList(boardId, listId, { title, position } = {}) {
  const body = {};
  if (title !== undefined) {
    const trimmed = title.trim();
    if (!trimmed) throw new MockApiError("List name can't be empty.");
    body.title = trimmed;
  }
  if (position !== undefined) body.position = position;

  const updated = await apiFetch(`/api/lists/${listId}`, { method: "PATCH", body });
  const list = normalizeList(updated);

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  if (board) {
    board.lists = board.lists.map((l) =>
      l.id === listId ? { ...l, name: list.name, position: list.position } : l
    );
    write(BOARD_DETAILS_KEY, details);
  }

  return list;
}

// Thin wrapper kept for the existing rename call site in KanbanBoard.js —
// a title-only PATCH via updateList above.
export async function renameList(boardId, listId, name) {
  return updateList(boardId, listId, { title: name });
}

// DELETE /api/lists/:id — OWNER/ADMIN only per the doc; cascades to every
// card/comment in the list server-side. Callers MUST confirm with the
// person first (KanbanBoard's list delete button already gates this
// behind ConfirmModal) and should hide the delete affordance for
// non-OWNER/ADMIN roles — the 403 is still handled here (surfaced via the
// thrown ApiError's message) in case the control is reached anyway.
export async function deleteList(boardId, listId) {
  await apiFetch(`/api/lists/${listId}`, { method: "DELETE" });

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  if (board) {
    const list = board.lists.find((l) => l.id === listId);
    const cards = { ...board.cards };
    (list?.cardIds || []).forEach((id) => delete cards[id]);
    board.cards = cards;
    board.lists = board.lists.filter((l) => l.id !== listId);
    write(BOARD_DETAILS_KEY, details);
  }

  return { ok: true };
}

// ---- Cards (real backend: POST /api/lists/:id/cards, PATCH/DELETE
// /api/cards/:id) ----
//
// `priority` IS a real, persisted backend field now (see
// lib/priorities.js for the lowercase-local <-> uppercase-wire
// conversion applied at this boundary). Remaining gap:
//   - `labels` on the backend is a flat array of free-text strings (see
//     the workspace-search example in the doc: `"labels": ["urgent",
//     "bug"]`) — there's no label entity or dedicated label endpoint.
//     There's no local palette anymore either: updateCard below sends
//     whatever string array the card modal's free-text label UI produced,
//     straight through as `labels`.

export async function createCard(boardId, listId, title, priority) {
  const trimmed = (title || "").trim();
  if (!trimmed) throw new MockApiError("Card title can't be empty.");

  // Real position: computed the same way createList/moveCard do, via the
  // one shared helper — never a client-generated index.
  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  const list = board?.lists.find((l) => l.id === listId);
  const siblingPositions = (list?.cardIds || []).map((id) => board.cards[id]?.position);
  const position = computeReorderPosition(siblingPositions, siblingPositions.length);

  const created = await apiFetch(`/api/lists/${listId}/cards`, {
    method: "POST",
    body: { title: trimmed, position, priority: toBackendPriority(priority) },
  });
  const card = { ...created, priority: fromBackendPriority(created.priority) };

  // Mirror into the bridge so a comment posted on this card later in the
  // same session (before the next fetchBoard()) finds it there — see
  // note above.
  if (board && list) {
    list.cardIds = [...list.cardIds, card.id];
    board.cards = { ...board.cards, [card.id]: card };
    write(BOARD_DETAILS_KEY, details);
  }

  return card;
}

// DELETE /api/cards/:id — OWNER/ADMIN only per the doc (regular MEMBERs
// can edit/move but not delete). Already role-gated at the call site:
// KanbanBoard.js only passes an onDelete handler into CardModal when
// workspaceRole is OWNER or ADMIN, and CardModal only renders the delete
// button when onDelete is truthy — so a MEMBER never sees the control.
// (An earlier version of this comment claimed this wasn't gated yet;
// that was wrong — verified directly against KanbanBoard.js's render
// call, not just this comment, before correcting it.)
export async function deleteCard(boardId, cardId) {
  await apiFetch(`/api/cards/${cardId}`, { method: "DELETE" });

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  if (board) {
    const { [cardId]: _discard, ...restCards } = board.cards;
    board.cards = restCards;
    board.lists = board.lists.map((l) => ({
      ...l,
      cardIds: l.cardIds.filter((id) => id !== cardId),
    }));
    write(BOARD_DETAILS_KEY, details);
  }

  return { ok: true };
}

// `position` is a real float, already computed by the shared
// computeReorderPosition/computePositionBetween helpers (lib/reorder.js)
// — KanbanBoard.js's client-side move logic computes it against the
// target list's existing card positions before calling this. This
// function's only job is to PATCH that ONE value (plus listId, and
// sourceListId when the caller has it — purely informational for other
// connected clients' socket handling per the doc, not used for anything
// here) and re-derive the target list's display order from positions —
// it must never recompute or renumber any other card's position.
export async function moveCard(boardId, cardId, targetListId, position, sourceListId) {
  const body = { listId: targetListId, position };
  if (sourceListId) body.sourceListId = sourceListId;

  const updated = await apiFetch(`/api/cards/${cardId}`, { method: "PATCH", body });

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  const targetList = board?.lists.find((l) => l.id === targetListId);
  if (board && targetList) {
    // Membership only — remove from whichever list currently holds it
    // (including targetList itself, for a same-list reorder).
    board.lists.forEach((l) => {
      l.cardIds = l.cardIds.filter((id) => id !== cardId);
    });

    board.cards = { ...board.cards, [cardId]: { ...board.cards[cardId], ...updated } };

    // Re-derive the target list's display order purely from positions
    // instead of trusting a spliced-in array index, so it can never
    // drift out of sync with the value that actually got persisted.
    targetList.cardIds = sortByPosition(
      [...targetList.cardIds, cardId].map((id) => board.cards[id])
    ).map((c) => c.id);

    write(BOARD_DETAILS_KEY, details);
  }

  return updated;
}

// Edit fields (title/description/dueDate/priority/labels/assigneeIds) —
// see the gap note above the section header for `labels`. `priority` is
// converted to the uppercase wire format on the way out and back to this
// app's lowercase local id on the way in (lib/priorities.js).
export async function updateCard(boardId, updatedCard) {
  const { id, title, description, dueDate, priority, labels, assigneeIds } = updatedCard;
  const trimmedTitle = (title || "").trim();
  if (!trimmedTitle) throw new MockApiError("Card title can't be empty.");

  const updated = await apiFetch(`/api/cards/${id}`, {
    method: "PATCH",
    body: {
      title: trimmedTitle,
      description: description ?? "",
      dueDate: dueDate ?? null,
      priority: toBackendPriority(priority),
      labels: labels ?? [],
      assigneeIds: assigneeIds ?? [],
    },
  });

  const merged = {
    ...updatedCard,
    ...updated,
    priority: fromBackendPriority(updated.priority),
  };

  const details = read(BOARD_DETAILS_KEY, seedBoardDetails);
  const board = details[boardId];
  if (board && board.cards[id]) {
    board.cards = { ...board.cards, [id]: merged };
    write(BOARD_DETAILS_KEY, details);
  }

  return merged;
}

// ---- Comments (real backend: GET/POST /api/cards/:id/comments, DELETE
// /api/comments/:commentId) ----
//
// Comments are NOT embedded on the card object anywhere in the real API —
// GET /api/boards/:id's nested card shape doesn't carry them, so they're
// fetched on demand (CardModal calls fetchComments when it opens) rather
// than being merged into board.cards the way the old mock layer did.
// The doc doesn't show a sample GET /comments response shape, only the
// POST body (`{ content, mentionedUserIds }`); comment rendering assumes
// each entry has at least `id`, `content`, `createdAt`, and some form of
// author identity (`authorId` and/or a nested `author` object) — worth
// confirming against a real response and adjusting if the shape differs.

export async function fetchComments(cardId) {
  const list = await apiFetch(`/api/cards/${cardId}/comments`);
  return Array.isArray(list) ? list : [];
}

export async function addComment(cardId, { content, mentionedUserIds } = {}) {
  const trimmed = (content || "").trim();
  if (!trimmed) throw new MockApiError("Comment can't be empty.");

  return apiFetch(`/api/cards/${cardId}/comments`, {
    method: "POST",
    body: { content: trimmed, mentionedUserIds: mentionedUserIds || [] },
  });
}

// Author-gated on the backend (403 for anyone else) — callers should also
// gate the delete affordance client-side to match, but this still needs
// to handle a 403 gracefully if it slips through (e.g. stale UI state).
export async function deleteComment(commentId) {
  await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" });
  return { ok: true };
}
