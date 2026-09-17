"use client";

// Shared insert-between float-position helper.
//
// Per the API doc, `position` is a float used to insert an item between
// its neighbors (e.g. 1.5 between 1 and 2) — for both lists and cards.
// This is the ONE place that computation happens; lists (lib/api.js
// createList) and cards (lib/api.js moveCard/createCard,
// components/KanbanBoard.js's client-side moveCard) all call into this
// rather than each having their own version.
//
// The anti-pattern this replaces: treating a plain array index as the
// value to persist, or — worse — renumbering every sibling's position to
// match its new array index on every reorder. Only the single item that
// actually moved should ever get a new position; every other item keeps
// whatever position it already had.

// How much room a fresh position leaves on either side, so a handful of
// reorders in a row don't immediately collide or need re-normalizing.
const GAP = 1;

/**
 * Computes the position value for an item being inserted at `index`
 * among `siblingPositions` — the positions of every OTHER item already
 * in the target list/column (i.e. NOT including the item being moved).
 * Non-numeric entries (e.g. a not-yet-migrated item with no position
 * yet) are ignored rather than breaking the calculation.
 *
 * `index` is the desired 0-based slot among those siblings, clamped to
 * the valid range.
 *
 * - No siblings -> GAP (an arbitrary starting point).
 * - Insert before the first sibling -> half its position, so positions
 *   only ever go negative if a sibling's position already was. This is
 *   what actually keeps positions non-negative under repeated
 *   insert-at-the-top moves (a real everyday drag pattern): halving a
 *   positive value can never cross zero, whereas subtracting a fixed
 *   GAP each time would walk straight past it.
 * - Insert after the last sibling -> last + GAP.
 * - Insert between two siblings -> their midpoint.
 */
export function computeReorderPosition(siblingPositions, index) {
  const positions = (siblingPositions || [])
    .filter((p) => typeof p === "number" && !Number.isNaN(p))
    .slice()
    .sort((a, b) => a - b);

  if (!positions.length) return GAP;

  const clamped = Math.max(0, Math.min(index, positions.length));

  if (clamped === 0) {
    const first = positions[0];
    return first > 0 ? first / 2 : first - GAP;
  }
  if (clamped === positions.length) {
    return positions[positions.length - 1] + GAP;
  }
  return (positions[clamped - 1] + positions[clamped]) / 2;
}

/**
 * Convenience wrapper around computeReorderPosition for callers that
 * think in terms of "the two cards this item is landing between" rather
 * than an array index — this is what drag-and-drop uses (see
 * KanbanBoard.js), since a drop target is naturally "before/after this
 * specific card" and translating that to an index is unnecessary and,
 * under an active search/filter, actively wrong (the index into a
 * filtered/visible list doesn't line up with the index into the real
 * unfiltered sibling array).
 *
 * `beforePos`/`afterPos` are the position values of the immediate
 * neighbor(s) the moved item should land between — either can be
 * omitted (undefined/null) to mean "no neighbor on that side" (dropping
 * at the very start or very end of the list).
 */
export function computePositionBetween(beforePos, afterPos) {
  const has = (p) => typeof p === "number" && !Number.isNaN(p);

  if (has(beforePos) && has(afterPos)) {
    return computeReorderPosition([beforePos, afterPos], 1);
  }
  if (has(afterPos)) {
    return computeReorderPosition([afterPos], 0);
  }
  if (has(beforePos)) {
    return computeReorderPosition([beforePos], 1);
  }
  return computeReorderPosition([], 0);
}

/**
 * Sorts items (lists or cards) by their `.position` field, ascending.
 * Items missing a numeric position (e.g. seed/mock data that predates
 * migration) sort after everything that has one, keeping their existing
 * relative order — so a missing position degrades gracefully instead of
 * throwing or scrambling the list.
 */
export function sortByPosition(items) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const pa = a.item?.position;
      const pb = b.item?.position;
      const aHas = typeof pa === "number" && !Number.isNaN(pa);
      const bHas = typeof pb === "number" && !Number.isNaN(pb);
      if (aHas && bHas) return pa - pb;
      if (aHas) return -1;
      if (bHas) return 1;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}
