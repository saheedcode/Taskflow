// Deliberately NOT "use client" — app/layout.js (a server component)
// needs NO_FLASH_SCRIPT at render time, and lib/theme.js (a client
// module) needs THEME_STORAGE_KEY, so this lives outside either
// boundary rather than forcing one file to import a client-only export.

export const THEME_STORAGE_KEY = "tf-theme";

// Runs synchronously, before hydration, as an inline <script> in
// app/layout.js's <head> — this is what prevents a light-mode flash on
// load for someone who chose (or whose OS prefers) dark mode. It must
// stay dependency-free plain JS (no imports, no JSX) since it's injected
// as a raw string, not executed as a module.
export const NO_FLASH_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;
