"use client";

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "number", label: "One number", test: (v) => /\d/.test(v) },
  { id: "special", label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function evaluatePassword(value) {
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(value) }));
  return { results, score: results.filter((r) => r.passed).length, maxScore: results.length };
}

export function isPasswordValid(value) {
  return evaluatePassword(value).score === PASSWORD_RULES.length;
}

const LEVELS = [
  { label: "Very weak", color: "bg-danger" },
  { label: "Weak", color: "bg-danger" },
  { label: "Fair", color: "bg-warn" },
  { label: "Good", color: "bg-warn" },
  { label: "Strong", color: "bg-success" },
  { label: "Very strong", color: "bg-success" },
];

/** Live strength bar + checklist. Renders nothing until the user types. */
export default function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const { results, score, maxScore } = evaluatePassword(password);
  const level = LEVELS[Math.min(score, LEVELS.length - 1)];

  return (
    <div className="mt-2.5 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1.5 overflow-hidden rounded-full bg-border-soft">
          {Array.from({ length: maxScore }).map((_, i) => (
            <span
              key={i}
              className={`h-full flex-1 rounded-full transition-colors ${
                i < score ? level.color : "bg-transparent"
              }`}
            />
          ))}
        </div>
        <span className="w-[72px] shrink-0 text-right text-[13.5px] font-medium text-ink-muted">
          {level.label}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {results.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-[13.5px] ${
              rule.passed ? "text-success" : "text-ink-faint"
            }`}
          >
            <RuleDot passed={rule.passed} />
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleDot({ passed }) {
  return passed ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="10" className="fill-success/15" />
      <path
        d="M7 12.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
    </svg>
  );
}
