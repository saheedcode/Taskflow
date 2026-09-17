"use client";

import { useRouter } from "next/navigation";
import LogoMark, { LogoLockup } from "./Logo";

export default function BoardSidebar({
  boardId,
  boardName,
  progress = 0,
  collapsed = false,
  active = "board",
  onToggleCollapse,
  onNavigate,
}) {
  const router = useRouter();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  function go(href) {
    onNavigate?.();
    router.push(href);
  }

  return (
    <div
      className={`flex h-full flex-col bg-ink-900 py-4 ${
        collapsed ? "w-[68px] px-2" : "w-[220px] px-3"
      }`}
    >
      <div className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-between px-1.5"}`}>
        {collapsed ? (
          <a href="/workspace" onClick={() => onNavigate?.()} aria-label="TaskFlow home">
            <LogoMark size={20} />
          </a>
        ) : (
          <a href="/workspace" onClick={() => onNavigate?.()}>
            <LogoLockup size={19} />
          </a>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-card text-white/40 hover:bg-white/10 hover:text-white lg:flex"
          >
            <ChevronIcon flipped={collapsed} />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          title={`${boardName} — ${pct}% complete`}
          aria-label={`${boardName}, ${pct}% complete. Expand sidebar`}
          className="mb-4 flex items-center justify-center"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ink-700 text-[12.5px] font-bold text-white/75">
            {pct}%
          </span>
        </button>
      ) : (
        <div className="mb-4 rounded-card bg-ink-700 p-2.5">
          <p className="mb-2 truncate text-[14.5px] font-bold text-white" title={boardName}>
            {boardName}
          </p>
          <div className="mb-1.5 h-[5px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] text-white/40">{pct}% complete</p>
        </div>
      )}

      <SideLabel collapsed={collapsed}>Boards</SideLabel>
      <nav className="mb-1 space-y-0.5">
        <SideItem
          icon={<BoardIcon />}
          label="Board"
          active={active === "board"}
          collapsed={collapsed}
          onClick={boardId ? () => go(`/board/${boardId}`) : () => {}}
        />
        <SideItem
          icon={<ClockIcon />}
          label="Timeline"
          active={active === "timeline"}
          collapsed={collapsed}
          disabled={!boardId}
          onClick={boardId ? () => go(`/board/${boardId}/timeline`) : undefined}
        />
        <SideItem
          icon={<ChartIcon />}
          label="Analytics"
          active={active === "analytics"}
          collapsed={collapsed}
          disabled={!boardId}
          onClick={boardId ? () => go(`/board/${boardId}/analytics`) : undefined}
        />
      </nav>

      <SideLabel collapsed={collapsed} className="mt-4">
        Workspace
      </SideLabel>
      <nav className="space-y-0.5">
        <SideItem icon={<UsersIcon />} label="Team & roles" collapsed={collapsed} onClick={() => go("/members")} />
        <SideItem icon={<GearIcon />} label="Settings" collapsed={collapsed} onClick={() => go("/settings")} />
      </nav>

      <button
        type="button"
        onClick={() => go("/workspace")}
        title="All boards"
        className={`mt-auto flex items-center gap-2.5 rounded-card px-2 py-2 text-[14px] font-medium text-white/45 hover:bg-white/5 hover:text-white/80 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <BackIcon />
        {collapsed ? null : "All boards"}
      </button>
    </div>
  );
}

function SideLabel({ children, collapsed, className = "" }) {
  return (
    <p
      className={`mb-1.5 text-[12.5px] font-bold uppercase tracking-wider text-white/30 ${
        collapsed ? "text-center" : "px-2"
      } ${className}`}
    >
      {collapsed ? "···" : children}
    </p>
  );
}

function SideItem({ icon, label, active, disabled, collapsed, onClick }) {
  return (
    <button
      type="button"
      title={collapsed ? label : disabled ? `${label} — coming soon` : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-card px-2 py-2 text-[14.5px] font-medium transition-colors ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-accent text-white"
          : disabled
          ? "cursor-default text-white/25"
          : "text-white/65 hover:bg-ink-700 hover:text-white"
      }`}
    >
      {icon}
      {collapsed ? null : label}
    </button>
  );
}

function BoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <rect x="3.5" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 4V20" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 4V20" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 14l3-3 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.8" opacity="0.6" />
      <path d="M15.5 13.3c2.3.4 3.8 2.1 4 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronIcon({ flipped }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 transition-transform ${flipped ? "rotate-180" : ""}`}
    >
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
