"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./themeConstants";

const THEME_CHANGE_EVENT = "tf:theme-changed";

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// Reads the CURRENT applied theme by checking the class the no-flash
// script (or a previous call to setTheme below) already put on <html> —
// not by re-deriving it from localStorage/system preference, so this
// always agrees with what's actually rendered instead of potentially
// recomputing a different answer.
export function getAppliedTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Applies a theme immediately (updates the DOM class so every component
// re-renders with the new CSS variables on its next paint) and persists
// the explicit choice, then tells other mounted components (this hook
// may be used in more than one place) to re-read it.
export function setTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private browsing, etc.) — the choice just
    // won't persist across reloads; it still applies for this session.
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
}

export function toggleTheme() {
  setTheme(getAppliedTheme() === "dark" ? "light" : "dark");
}

// React hook for any component that needs to READ the current theme
// reactively (e.g. to swap an icon) or offer a toggle control. Not
// needed just to apply the initial theme — that's the no-flash script's
// job, before React even mounts.
export function useTheme() {
  // Start as "light" for the server-rendered/first-paint markup (Next.js
  // SSR has no access to localStorage or the class the no-flash script
  // sets), then sync to the real applied value on mount. This one-time
  // mismatch is expected and intentional — see the comment on the
  // no-flash script in app/layout.js for why the visual flash is
  // avoided even though this piece of React state briefly lags it.
  const [theme, setThemeState] = useState("light");

  useEffect(() => {
    setThemeState(getAppliedTheme());
    function onChange(e) {
      setThemeState(e.detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, onChange);

    // Follow the OS-level preference change ONLY if the person never
    // made an explicit choice on this device — an explicit choice via
    // setTheme() above should stick even if the OS setting changes later.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange(e) {
      let hasExplicitChoice = false;
      try {
        hasExplicitChoice = window.localStorage.getItem(THEME_STORAGE_KEY) != null;
      } catch {
        // Treat as no explicit choice if storage isn't readable.
      }
      if (!hasExplicitChoice) {
        setTheme(e.matches ? "dark" : "light");
      }
    }
    media.addEventListener("change", onSystemChange);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onChange);
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  return {
    theme,
    isDark: theme === "dark",
    toggle: toggleTheme,
    setTheme,
  };
}

// Exported only so app/layout.js's inline script string can be built
// from one place rather than duplicating the logic as a second copy of
// this file's decision-making inline in JSX. See lib/themeConstants.js.
export { NO_FLASH_SCRIPT } from "./themeConstants";
