// Mock data layer.
// Every function here is written the way an eventual API client would be
// shaped (async, returns plain data) so swapping in real fetch calls to the
// backend later is a drop-in replacement — see lib/api.js (TODO) once the
// API exists.

export const currentUser = {
  id: "u1",
  name: "Maya Odukoya",
  initials: "MO",
  email: "maya@flowlab.dev",
};

export const members = [
  {
    id: "u1",
    name: "Maya Odukoya",
    initials: "MO",
    color: "#1F6F78",
    email: "maya@flowlab.dev",
    role: "Owner",
    joinedAt: "Jan 2024",
  },
  {
    id: "u2",
    name: "Sam Wren",
    initials: "SW",
    color: "#C99A3E",
    email: "sam@flowlab.dev",
    role: "Admin",
    joinedAt: "Mar 2024",
  },
  {
    id: "u3",
    name: "Priya Nair",
    initials: "PN",
    color: "#E2673B",
    email: "priya@flowlab.dev",
    role: "Member",
    joinedAt: "Jun 2024",
  },
  {
    id: "u4",
    name: "Leo Fischer",
    initials: "LF",
    color: "#3F8F5F",
    email: "leo@flowlab.dev",
    role: "Member",
    joinedAt: "Sep 2024",
  },
];

// A person can belong to more than one workspace and switch between them
// (see the workspace switcher in NavContent.js). Every board is tagged with
// the workspace it lives in via `workspaceId`, so the boards grid can be
// filtered down to whichever workspace is currently active.
export const workspaces = [
  { id: "w1", name: "Flow Lab", plan: "Team" },
  { id: "w2", name: "Nimbus Studio", plan: "Free" },
  { id: "w3", name: "Beacon Labs", plan: "Team" },
];

// Back-compat fallback: the workspace shown before the active one has been
// resolved from storage on first paint (mirrors how `currentUser` is used
// as a fallback for session data elsewhere in this file).
export const workspace = workspaces[0];

export const boards = [
  {
    id: "b1",
    name: "Product Launch",
    description: "TaskFlow v2 public launch",
    color: "#1F6F78",
    cardCount: 18,
    progress: 68,
    memberIds: ["u1", "u2", "u3"],
    updatedAt: "2h ago",
    workspaceId: "w1",
  },
  {
    id: "b2",
    name: "Design System",
    description: "Component library & tokens",
    color: "#C99A3E",
    cardCount: 9,
    progress: 82,
    memberIds: ["u1", "u4"],
    updatedAt: "yesterday",
    workspaceId: "w1",
  },
  {
    id: "b3",
    name: "Customer Onboarding",
    description: "Self-serve signup flow",
    color: "#E2673B",
    cardCount: 12,
    progress: 41,
    memberIds: ["u2", "u3", "u4"],
    updatedAt: "3d ago",
    workspaceId: "w1",
  },
  {
    id: "b4",
    name: "Infra & Reliability",
    description: "Uptime, monitoring, on-call",
    color: "#3F8F5F",
    cardCount: 6,
    progress: 24,
    memberIds: ["u1"],
    updatedAt: "1w ago",
    workspaceId: "w1",
  },
  {
    id: "b5",
    name: "Investor Deck",
    description: "Q4 fundraising materials",
    color: "#8B5CF6",
    cardCount: 5,
    progress: 55,
    memberIds: ["u1", "u3"],
    updatedAt: "5h ago",
    workspaceId: "w2",
  },
  {
    id: "b6",
    name: "Mobile App Beta",
    description: "iOS/Android beta rollout",
    color: "#3457D5",
    cardCount: 8,
    progress: 30,
    memberIds: ["u2", "u4"],
    updatedAt: "1d ago",
    workspaceId: "w3",
  },
];

// Status pill shown on each board tile in the workspace overview, derived
// from progress the same way a backend rollup of "% cards done" would
// drive it — thresholds live in one place so the grid and any future
// board-level summary stay in sync.
export function boardStatus(progress) {
  if (progress >= 75) {
    return { label: "On track", tone: "success" };
  }
  if (progress >= 35) {
    return { label: "Active", tone: "accent" };
  }
  return { label: "At risk", tone: "danger" };
}

const labelPalette = {
  bug: { name: "Bug", color: "#E2673B" },
  feature: { name: "Feature", color: "#1F6F78" },
  design: { name: "Design", color: "#C99A3E" },
  urgent: { name: "Urgent", color: "#B23A3A" },
  chore: { name: "Chore", color: "#5B6570" },
};

export const labels = labelPalette;

export const priorities = {
  critical: { name: "Critical", color: "#E5573F", tint: "#FCE9E5" },
  high: { name: "High", color: "#B9791F", tint: "#FBF1DE" },
  med: { name: "Med", color: "#3457D5", tint: "#EAEFFC" },
  low: { name: "Low", color: "#6B7080", tint: "#ECEDF2" },
};

// Board detail: lists + cards, keyed by board id.
export const boardDetails = {
  b1: {
    id: "b1",
    name: "Product Launch",
    color: "#1F6F78",
    lists: [
      {
        id: "l1",
        name: "Backlog",
        cardIds: ["c1", "c2", "c3"],
      },
      {
        id: "l2",
        name: "In Progress",
        cardIds: ["c4", "c5"],
      },
      {
        id: "l3",
        name: "In Review",
        cardIds: ["c6"],
      },
      {
        id: "l4",
        name: "Done",
        cardIds: ["c7", "c8"],
      },
    ],
    cards: {
      c1: { id: "c1", title: "Draft launch announcement blog post", description: "Cover the headline features and migration notes.", labelIds: ["feature"], dueDate: "2026-09-08", assigneeIds: ["u2"], priority: "med", commentCount: 3 },
      c2: { id: "c2", title: "Finalize pricing page copy", description: "", labelIds: ["chore"], dueDate: null, assigneeIds: [], priority: "low", commentCount: 0 },
      c3: { id: "c3", title: "Fix card drag ghost flicker on Safari", description: "Repros on 17.x, only on trackpad drags.", labelIds: ["bug"], dueDate: "2026-09-05", assigneeIds: ["u1"], priority: "high", commentCount: 5 },
      c4: { id: "c4", title: "Build presence indicator avatars", description: "Small stacked avatars top-right of board when others are viewing.", labelIds: ["feature", "design"], dueDate: "2026-09-10", assigneeIds: ["u1", "u4"], priority: "med", commentCount: 2 },
      c5: { id: "c5", title: "Rate limit auth endpoints", description: "", labelIds: ["urgent"], dueDate: "2026-09-04", assigneeIds: ["u3"], priority: "critical", commentCount: 1 },
      c6: { id: "c6", title: "Review onboarding empty states", description: "Check copy tone against writing guidelines.", labelIds: ["design"], dueDate: null, assigneeIds: ["u4"], priority: "med", commentCount: 4 },
      c7: { id: "c7", title: "Set up GitHub Actions CI pipeline", description: "", labelIds: ["chore"], dueDate: "2026-08-28", assigneeIds: ["u1"], priority: "low", commentCount: 0 },
      c8: { id: "c8", title: "Write auth integration tests", description: "Cover signup, login, password reset, expired token.", labelIds: ["feature"], dueDate: "2026-08-30", assigneeIds: ["u3"], priority: "high", commentCount: 2 },
    },
  },
  b2: {
    id: "b2",
    name: "Design System",
    color: "#C99A3E",
    lists: [
      { id: "l5", name: "To Do", cardIds: ["c9"] },
      { id: "l6", name: "In Progress", cardIds: ["c10"] },
      { id: "l7", name: "Done", cardIds: ["c11"] },
    ],
    cards: {
      c9: { id: "c9", title: "Define spacing scale", description: "", labelIds: ["design"], dueDate: null, assigneeIds: ["u4"], priority: "low", commentCount: 0 },
      c10: { id: "c10", title: "Build Card and Badge components", description: "", labelIds: ["feature", "design"], dueDate: "2026-09-06", assigneeIds: ["u1"], priority: "med", commentCount: 1 },
      c11: { id: "c11", title: "Publish color token docs", description: "", labelIds: ["chore"], dueDate: null, assigneeIds: [], priority: "low", commentCount: 0 },
    },
  },
  b3: {
    id: "b3",
    name: "Customer Onboarding",
    color: "#E2673B",
    lists: [
      { id: "l8", name: "Ideas", cardIds: ["c12"] },
      { id: "l9", name: "Building", cardIds: ["c13"] },
      { id: "l10", name: "Shipped", cardIds: [] },
    ],
    cards: {
      c12: { id: "c12", title: "Progressive signup (email-only first step)", description: "", labelIds: ["feature"], dueDate: null, assigneeIds: ["u3"], priority: "med", commentCount: 2 },
      c13: { id: "c13", title: "Add sample workspace seed data", description: "", labelIds: ["chore"], dueDate: "2026-09-12", assigneeIds: ["u2"], priority: "low", commentCount: 0 },
    },
  },
  b4: {
    id: "b4",
    name: "Infra & Reliability",
    color: "#3F8F5F",
    lists: [
      { id: "l11", name: "Backlog", cardIds: ["c14"] },
      { id: "l12", name: "Done", cardIds: [] },
    ],
    cards: {
      c14: { id: "c14", title: "Add WebSocket reconnection backoff", description: "", labelIds: ["bug", "urgent"], dueDate: "2026-09-03", assigneeIds: ["u1"], priority: "critical", commentCount: 1 },
    },
  },
  b5: {
    id: "b5",
    name: "Investor Deck",
    color: "#8B5CF6",
    lists: [
      { id: "l13", name: "Outline", cardIds: ["c15"] },
      { id: "l14", name: "Drafting", cardIds: ["c16"] },
      { id: "l15", name: "Final", cardIds: [] },
    ],
    cards: {
      c15: { id: "c15", title: "Gather Q4 growth metrics", description: "Pull ARR, retention, and pipeline numbers from finance.", labelIds: ["chore"], dueDate: "2026-09-09", assigneeIds: ["u1"], priority: "high", commentCount: 0 },
      c16: { id: "c16", title: "Design market-sizing slide", description: "", labelIds: ["design"], dueDate: null, assigneeIds: ["u3"], priority: "med", commentCount: 1 },
    },
  },
  b6: {
    id: "b6",
    name: "Mobile App Beta",
    color: "#3457D5",
    lists: [
      { id: "l16", name: "To Do", cardIds: ["c17"] },
      { id: "l17", name: "In Progress", cardIds: ["c18"] },
      { id: "l18", name: "Done", cardIds: [] },
    ],
    cards: {
      c17: { id: "c17", title: "Set up TestFlight distribution", description: "", labelIds: ["chore"], dueDate: "2026-09-11", assigneeIds: ["u2"], priority: "med", commentCount: 0 },
      c18: { id: "c18", title: "Fix push notification permission prompt", description: "Shows twice on first launch on Android 14.", labelIds: ["bug"], dueDate: "2026-09-07", assigneeIds: ["u4"], priority: "high", commentCount: 2 },
    },
  },
};

// Notifications: read/unread activity feed. `unread: false` entries make
// up the notification history; the unread ones drive the sidebar badge.
export const notifications = [
  {
    id: "n1",
    unread: true,
    actorId: "u3",
    verb: "assigned you to",
    cardTitle: "Rate limit auth endpoints",
    boardId: "b1",
    boardName: "Product Launch",
    createdAt: "10m ago",
  },
  {
    id: "n2",
    unread: true,
    actorId: "u2",
    verb: "commented on",
    cardTitle: "Draft launch announcement blog post",
    boardId: "b1",
    boardName: "Product Launch",
    createdAt: "1h ago",
  },
  {
    id: "n3",
    unread: true,
    actorId: "u4",
    verb: "moved",
    cardTitle: "Review onboarding empty states",
    boardId: "b1",
    boardName: "Product Launch",
    createdAt: "3h ago",
  },
  {
    id: "n4",
    unread: false,
    actorId: "u1",
    verb: "marked complete",
    cardTitle: "Set up GitHub Actions CI pipeline",
    boardId: "b1",
    boardName: "Product Launch",
    createdAt: "yesterday",
  },
  {
    id: "n5",
    unread: false,
    actorId: "u4",
    verb: "set a due date on",
    cardTitle: "Build Card and Badge components",
    boardId: "b2",
    boardName: "Design System",
    createdAt: "2d ago",
  },
  {
    id: "n6",
    unread: false,
    actorId: "u3",
    verb: "assigned you to",
    cardTitle: "Progressive signup (email-only first step)",
    boardId: "b3",
    boardName: "Customer Onboarding",
    createdAt: "3d ago",
  },
  {
    id: "n7",
    unread: false,
    actorId: "u1",
    verb: "created",
    cardTitle: "Add WebSocket reconnection backoff",
    boardId: "b4",
    boardName: "Infra & Reliability",
    createdAt: "1w ago",
  },
];

export function getMember(id) {
  return members.find((m) => m.id === id);
}
