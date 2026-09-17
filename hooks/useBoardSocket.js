"use client";

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getToken, getBaseUrl } from "@/lib/apiClient";

/**
 * Owns exactly one socket.io connection for whichever board is currently
 * open, per the API doc's Real-time section.
 *
 * - Connects with the stored JWT in the handshake (`auth: { token }`),
 *   same as every other authenticated call in this app.
 * - Emits `board:join { boardId }` on every successful connect (room
 *   membership doesn't survive a disconnect, so this re-joins on
 *   reconnect too, not just the first time) and `board:leave { boardId }`
 *   on close/unmount.
 * - Wires the server->client events from the doc (`card:updated`,
 *   `card:moved`, `comment:created`, `presence:sync`) to whatever
 *   handlers the caller passes in, plus `board:join_error` — sent back
 *   specifically to this socket when a `board:join` is rejected because
 *   the connected user isn't actually a member of that board's
 *   workspace. That's the one case where the caller should know
 *   real-time updates for this board will never arrive at all, not just
 *   that one happened to be missed.
 *
 * Real-time events are explicitly best-effort per the doc — "if the
 * socket layer isn't connected for any reason, the REST call still
 * succeeds; you just won't get a live update." This hook treats them the
 * same way: it never claims to be the source of truth. On the FIRST
 * connect there's nothing to recover (the caller already has a fresh
 * board from a REST fetch), but on every RECONNECT after that, whatever
 * happened while the socket was down was missed entirely — so
 * `onReconnect` fires so the caller can refetch the board over REST
 * instead of trusting local state built from whatever events did or
 * didn't arrive.
 *
 * `handlers` can be a fresh object every render — only `boardId` is a
 * real dependency; the latest handlers are read out of a ref so passing
 * new function identities each render doesn't tear down and reconnect
 * the socket.
 */
export function useBoardSocket(boardId, handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!boardId) return undefined;
    const token = getToken();
    if (!token) return undefined; // no session — nothing to authenticate the handshake with

    const socket = io(getBaseUrl(), { auth: { token } });
    let hasConnectedBefore = false;

    function onConnect() {
      socket.emit("board:join", { boardId });
      if (hasConnectedBefore) {
        handlersRef.current.onReconnect?.();
      }
      hasConnectedBefore = true;
    }

    function onCardUpdated(payload) {
      handlersRef.current.onCardUpdated?.(payload || {});
    }
    function onCardMoved(payload) {
      handlersRef.current.onCardMoved?.(payload || {});
    }
    function onCommentCreated(payload) {
      handlersRef.current.onCommentCreated?.(payload || {});
    }
    function onPresenceSync(payload) {
      handlersRef.current.onPresenceSync?.(Array.isArray(payload) ? payload : []);
    }
    function onJoinError(payload) {
      handlersRef.current.onJoinError?.(payload?.message || "You can't view live updates for this board.");
    }

    socket.on("connect", onConnect);
    socket.on("card:updated", onCardUpdated);
    socket.on("card:moved", onCardMoved);
    socket.on("comment:created", onCommentCreated);
    socket.on("presence:sync", onPresenceSync);
    socket.on("board:join_error", onJoinError);

    return () => {
      // Best-effort on the way out too — if the socket's already gone,
      // this is a no-op rather than something worth surfacing an error
      // for.
      if (socket.connected) {
        socket.emit("board:leave", { boardId });
      }
      socket.off("connect", onConnect);
      socket.off("card:updated", onCardUpdated);
      socket.off("card:moved", onCardMoved);
      socket.off("comment:created", onCommentCreated);
      socket.off("presence:sync", onPresenceSync);
      socket.off("board:join_error", onJoinError);
      socket.disconnect();
    };
  }, [boardId]);
}
