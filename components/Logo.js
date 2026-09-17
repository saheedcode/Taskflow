export default function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <line
        x1="3"
        y1="17"
        x2="19"
        y2="5"
        stroke="#3457D5"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="3" cy="17" r="3" fill="#8B5CF6" />
      <circle cx="11" cy="11" r="3" fill="#3457D5" />
      <circle cx="19" cy="5" r="3" fill="#2BB673" />
    </svg>
  );
}

export function LogoLockup({ size = 22, textClassName = "text-white" }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className={`font-display text-[16px] font-semibold tracking-tight ${textClassName}`}>
        TaskFlow
      </span>
    </span>
  );
}
