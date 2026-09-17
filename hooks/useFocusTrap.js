"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Traps keyboard focus inside a dialog/drawer while it's open.
 *
 * - Moves focus into the container as soon as it becomes active (either to
 *   `initialFocusRef`, or the first focusable element inside it).
 * - Keeps Tab / Shift+Tab cycling within the container's focusable elements.
 * - Calls `onEscape` when Escape is pressed, instead of every caller wiring
 *   up its own window-level listener.
 * - Restores focus to whatever element had focus right before the dialog
 *   opened, once it closes (or unmounts) — e.g. back to the card that
 *   opened a modal, or the button that opened a drawer.
 *
 * `containerRef` should point at the dialog/drawer root. The hook is a
 * no-op while `active` is false, so it's safe to call unconditionally from
 * components that toggle a dialog open/closed with state.
 */
export function useFocusTrap({ active, containerRef, onEscape, initialFocusRef }) {
  const previouslyFocused = useRef(null);

  // Keep the latest onEscape in a ref rather than the effect's dependency
  // array — callers typically pass a fresh function each render, and we
  // don't want that to re-run the effect below (which would re-steal
  // focus to the initial element on every keystroke elsewhere in the form).
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return undefined;

    previouslyFocused.current = document.activeElement;

    const container = containerRef.current;
    const toFocus = initialFocusRef?.current || getFocusable(container)[0];
    // Defer slightly so the dialog has finished mounting/animating in.
    const focusFrame = requestAnimationFrame(() => {
      toFocus?.focus();
    });

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = getFocusable(containerRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !containerRef.current?.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !containerRef.current?.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }

    // Capture phase so this runs before any other Escape/Tab handling
    // still attached elsewhere in the tree.
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      const toRestore = previouslyFocused.current;
      if (toRestore && document.contains(toRestore) && typeof toRestore.focus === "function") {
        toRestore.focus();
      }
    };
    // Deliberately excludes onEscape (see ref above) so the trap doesn't
    // re-run — and re-steal focus — on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef, initialFocusRef]);
}
