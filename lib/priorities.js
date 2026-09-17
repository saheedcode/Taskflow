// Priority display metadata.
//
// `priority` IS a real, persisted backend field now: PATCH
// /api/cards/:id accepts it and POST /api/lists/:id/cards accepts it
// optionally (defaulting server-side to "MED"), and GET /api/boards/:id's
// nested card shape as well as the workspace-search response both return
// it. On the wire it's uppercase — "LOW" | "MED" | "HIGH" | "CRITICAL" —
// while the rest of this app (this file, CardItem.js, CardModal.js,
// KanbanBoard.js's priority filter) has always used lowercase ids
// ("low" | "med" | "high" | "critical") as keys into `priorities` below.
// Rather than rename every local id through the whole UI, the API
// boundary in lib/api.js converts at the edge using the two helpers
// below — everything else in the app keeps using lowercase ids exactly
// as before.
//
// This is UI-only styling data (name/color/tint), not seed content, so
// it lives here rather than in lib/mockData.js — CardItem.js and
// CardModal.js both import from here instead of the mock layer.

export const priorities = {
  critical: { name: "Critical", color: "#E5573F", tint: "#FCE9E5" },
  high: { name: "High", color: "#B9791F", tint: "#FBF1DE" },
  med: { name: "Med", color: "#3457D5", tint: "#EAEFFC" },
  low: { name: "Low", color: "#6B7080", tint: "#ECEDF2" },
};

export const defaultPriority = "med";

export function getPriority(id) {
  return priorities[id] || priorities[defaultPriority];
}

// Lowercase local id -> uppercase backend value, for request bodies.
// Anything unrecognized falls back to the backend's own default ("MED")
// rather than sending a value it might reject.
export function toBackendPriority(id) {
  const key = String(id || defaultPriority).toLowerCase();
  return priorities[key] ? key.toUpperCase() : "MED";
}

// Uppercase backend value -> lowercase local id, for responses. Falls
// back to the local default if the backend ever sends something this
// build doesn't recognize, rather than crashing getPriority() downstream.
export function fromBackendPriority(value) {
  const key = String(value || "MED").toLowerCase();
  return priorities[key] ? key : defaultPriority;
}
