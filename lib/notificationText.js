// Copy for real backend notifications (GET /api/notifications).
//
// The backend notification shape is:
//   { id, unread, actorId, verb, cardId, cardTitle, boardId, boardName, createdAt }
// with `verb` one of: "assigned_card" | "mentioned" | "due_soon".
//
// Two things this deliberately does NOT do:
//   - Resolve `actorId` to a name. The doc doesn't give us any endpoint
//     that returns an arbitrary user's public profile by id (only
//     GET /api/auth/me for the current user, and
//     GET /api/workspaces/:id/members for a *specific* workspace's
//     members) — and a notification can point at any board across any
//     workspace the user belongs to. Rather than fake a name from a
//     workspace member list that may not even contain that user, copy
//     is written to read naturally without needing the actor's name at
//     all.
//   - Assume `actorId` is present. For `due_soon`, the doc is explicit
//     that `actorId` is null (nobody triggered it — it's the scheduled
//     reminder job), so the "who" is dropped from that copy entirely
//     rather than rendering "null" or "Someone".

const VERB_COPY = {
  assigned_card: (n) => `You were assigned to "${n.cardTitle}"`,
  mentioned: (n) => `You were mentioned in a comment on "${n.cardTitle}"`,
  due_soon: (n) => `"${n.cardTitle}" is due soon`,
};

export function notificationText(notification) {
  const build = VERB_COPY[notification?.verb];
  if (build) return build(notification);
  // Unknown verb (future backend addition) — degrade gracefully instead
  // of throwing, since this drives notification-center rendering.
  return notification?.cardTitle
    ? `Update on "${notification.cardTitle}"`
    : "New notification";
}

// Short label for the boardName/createdAt line under the main copy.
export function notificationSubtitle(notification) {
  return notification?.boardName || null;
}
