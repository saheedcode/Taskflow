/** @type {import('tailwindcss').Config} */

// Tailwind's documented pattern for CSS-variable-backed colors that still
// support opacity modifiers (bg-canvas/50, etc). Each variable holds a
// space-separated "R G B" triplet (CSS Color 4 syntax), swapped between
// :root and .dark in globals.css — see the theme section there for why
// only some tokens are reactive and others (ink-900/800/700 — the fixed
// dark-navy chrome used for the sidebar, modals' scrim, toasts) are kept
// as plain hex and stay the same in both themes on purpose.
function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: withOpacity("--color-canvas"),
        surface: withOpacity("--color-surface"),
        ink: {
          DEFAULT: withOpacity("--color-ink"),
          muted: withOpacity("--color-ink-muted"),
          faint: withOpacity("--color-ink-faint"),
          // Fixed brand-navy chrome (sidebar, modal scrims, toasts) —
          // intentionally NOT theme-reactive, see note above.
          900: "#14162B",
          800: "#1B1E3B",
          700: "#262A4C",
        },
        border: {
          DEFAULT: withOpacity("--color-border"),
          soft: withOpacity("--color-border-soft"),
        },
        accent: {
          DEFAULT: withOpacity("--color-accent"),
          dark: withOpacity("--color-accent-dark"),
          light: withOpacity("--color-accent-light"),
        },
        success: {
          DEFAULT: withOpacity("--color-success"),
          light: withOpacity("--color-success-light"),
        },
        warn: {
          DEFAULT: withOpacity("--color-warn"),
          light: withOpacity("--color-warn-light"),
        },
        danger: {
          DEFAULT: withOpacity("--color-danger"),
          light: withOpacity("--color-danger-light"),
        },
        violet: {
          DEFAULT: withOpacity("--color-violet"),
          light: withOpacity("--color-violet-light"),
        },
      },
      fontFamily: {
        display: ["var(--font-sora)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Plain CSS var references (not the withOpacity() helper — these
        // are full shadow strings, not colors) so each theme's globals.css
        // block can swap in a shadow tuned for its own background instead
        // of the same dark drop-shadow looking muddy on a dark surface.
        card: "var(--shadow-card)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-pop)",
      },
      borderRadius: {
        card: "12px",
        panel: "14px",
      },
    },
  },
  plugins: [],
};
