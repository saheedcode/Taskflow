import { LogoLockup } from "./Logo";

const STAGES = [
  { label: "To do", color: "#9CA0AF" },
  { label: "In progress", color: "#3457D5" },
  { label: "Done", color: "#2BB673" },
];

export default function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[42%_1fr]">
      {/* Dark brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white md:flex lg:p-14">
        <a href="/login" className="flex items-center gap-2">
          <LogoLockup />
        </a>

        <div className="max-w-md">
          <p className="font-display text-[34px] font-semibold leading-[1.25] tracking-tight text-white lg:text-[36px]">
            Plan the work. Watch it move &mdash; live.
          </p>
          <p className="mt-3.5 max-w-sm text-[15px] leading-relaxed text-white/55">
            Boards, lists, and cards for small teams, with every change
            synced to everyone the instant it happens.
          </p>

          <div className="mt-10 flex flex-wrap gap-2.5">
            {STAGES.map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[13.5px] text-white/70"
              >
                <span
                  className="h-[8px] w-[8px] rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <p className="text-[13.5px] text-white/35">
          &copy; 2026 TaskFlow &middot; Built as a fullstack capstone
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <a href="/login" className="mb-8 flex items-center gap-2 md:hidden">
            <LogoLockup textClassName="text-ink" />
          </a>

          {eyebrow ? (
            <p className="text-[14.5px] font-medium text-accent-dark">{eyebrow}</p>
          ) : null}
          <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-[15px] text-ink-muted">{subtitle}</p>
          ) : null}

          <div className="mt-7">{children}</div>

          {footer ? (
            <p className="mt-6 text-center text-[14.5px] text-ink-muted">{footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
