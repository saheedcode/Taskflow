// Display-only helpers for rendering a person as a small circular avatar
// when there's no `avatarUrl` to show an actual photo.
//
// Real backend user objects ({id, name, avatarUrl}) don't carry a color
// the way lib/mockData.js's old member records did — this derives a
// stable one from the id instead, purely for visual distinction between
// people in a list. It's not persisted or sent anywhere.

const PALETTE = [
  "#1F6F78",
  "#C99A3E",
  "#E2673B",
  "#3F8F5F",
  "#8B5CF6",
  "#3457D5",
  "#B23A3A",
  "#5B6570",
];

export function initialsFor(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function colorForId(id) {
  const str = String(id || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
