"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { workspace as fallbackWorkspace, currentUser as fallbackUser } from "@/lib/mockData";
import { getSession, logOut } from "@/lib/auth";
import {
  fetchNotifications,
  fetchWorkspaces,
  fetchWorkspace,
  switchWorkspace,
  createWorkspace,
} from "@/lib/api";
import { LogoLockup } from "./Logo";
import LogoutConfirmModal from "./LogoutConfirmModal";
import AvatarCircle from "./AvatarCircle";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { label: "Boards", icon: BoardsIcon, href: "/workspace" },
  { label: "Search", icon: SearchIcon, href: "/search" },
  { label: "Notifications", icon: BellIcon, href: "/notifications" },
  { label: "Members", icon: UsersIcon, href: "/members" },
  { label: "Settings", icon: GearIcon, href: "/settings" },
];

export default function NavContent({ onNavigate }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(fallbackUser);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const wsMenuRef = useRef(null);

  // ---- Workspace switcher ----
  const [workspaceList, setWorkspaceList] = useState([fallbackWorkspace]);
  const [activeWorkspace, setActiveWorkspace] = useState(fallbackWorkspace);
  const [switchingId, setSwitchingId] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  const newWorkspaceInputRef = useRef(null);

  function loadWorkspaces() {
    fetchWorkspaces()
      .then(setWorkspaceList)
      .catch(() => {
        // Non-critical for the switcher list — it just stays as last-known.
      });
    fetchWorkspace()
      .then(setActiveWorkspace)
      .catch(() => {
        // Non-critical — the header keeps showing the last-known workspace.
      });
  }

  useEffect(() => {
    loadWorkspaces();
    function onWorkspaceChanged() {
      loadWorkspaces();
    }
    window.addEventListener("tf:workspace-changed", onWorkspaceChanged);
    return () => window.removeEventListener("tf:workspace-changed", onWorkspaceChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (creatingWorkspace) {
      newWorkspaceInputRef.current?.focus();
    }
  }, [creatingWorkspace]);

  async function handleSwitchWorkspace(id) {
    if (id === activeWorkspace.id) {
      setWsMenuOpen(false);
      return;
    }
    setSwitchingId(id);
    setSwitchError(null);
    try {
      const ws = await switchWorkspace(id);
      setActiveWorkspace(ws);
      setWsMenuOpen(false);
      setCreatingWorkspace(false);
      onNavigate?.();
      // A board from the previous workspace no longer applies here, so
      // land back on the boards grid for the newly active workspace.
      router.push("/workspace");
    } catch (err) {
      setSwitchError(err.message || "Couldn't switch workspaces. Try again.");
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleCreateWorkspace(e) {
    e.preventDefault();
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) return;
    setCreatingSubmitting(true);
    setCreateError(null);
    try {
      const ws = await createWorkspace(trimmed);
      setWorkspaceList((prev) => [...prev, ws]);
      setNewWorkspaceName("");
      setCreatingWorkspace(false);
      await handleSwitchWorkspace(ws.id);
    } catch (err) {
      setCreateError(err.message || "Couldn't create that workspace.");
    } finally {
      setCreatingSubmitting(false);
    }
  }

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session);

    function onSessionUpdated(e) {
      if (e.detail) setUser(e.detail);
    }
    window.addEventListener("tf:session-updated", onSessionUpdated);
    return () => window.removeEventListener("tf:session-updated", onSessionUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((list) => {
        if (!cancelled) setUnreadCount(list.filter((n) => n.unread).length);
      })
      .catch(() => {
        // Non-critical for the nav badge — just leave the last known count.
      });
    return () => {
      cancelled = true;
    };
    // Re-check whenever the person navigates, so reading notifications
    // clears the badge without a full page reload.
  }, [pathname]);

  async function handleConfirmLogOut() {
    logOut();
    router.push("/login");
    // No need to close/reset the modal here — navigating away unmounts it.
  }

  useEffect(() => {
    if (!wsMenuOpen) return;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setWsMenuOpen(false);
        setCreatingWorkspace(false);
      }
    }
    function onClickOutside(e) {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target)) {
        setWsMenuOpen(false);
        setCreatingWorkspace(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [wsMenuOpen]);

  function initialsFor(name) {
    return (name || "WS")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  const workspaceInitials = initialsFor(activeWorkspace.name);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <a href="/workspace" onClick={onNavigate}>
          <LogoLockup />
        </a>
      </div>

      <div className="relative mx-4 mb-5" ref={wsMenuRef}>
        <button
          type="button"
          onClick={() => setWsMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={wsMenuOpen}
          className="flex w-full items-center justify-between rounded-card border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-violet/90 text-[13px] font-semibold text-white">
              {workspaceInitials}
            </span>
            <span className="truncate text-[15px] font-medium text-white">
              {activeWorkspace.name}
            </span>
          </span>
          <ChevronsIcon />
        </button>

        {wsMenuOpen ? (
          <div
            role="menu"
            aria-label="Switch workspace"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-card border border-white/10 bg-ink-800 shadow-pop"
          >
            {switchError ? (
              <p className="border-b border-white/10 px-3 py-2 text-[13.5px] text-danger">
                {switchError}
              </p>
            ) : null}

            <div className="max-h-56 overflow-y-auto py-1.5">
              {workspaceList.map((ws) => {
                const active = ws.id === activeWorkspace.id;
                const isSwitching = switchingId === ws.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    disabled={isSwitching}
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14.5px] text-white hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-violet/90 text-[12px] font-semibold text-white">
                      {initialsFor(ws.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                    {isSwitching ? (
                      <span className="text-[13px] text-white/50">Switching…</span>
                    ) : active ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-white/10">
              {creatingWorkspace ? (
                <form onSubmit={handleCreateWorkspace} className="px-3 py-2.5">
                  {createError ? (
                    <p className="mb-1.5 text-[13.5px] text-danger">{createError}</p>
                  ) : null}
                  <input
                    ref={newWorkspaceInputRef}
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setCreatingWorkspace(false);
                        setNewWorkspaceName("");
                        setCreateError(null);
                      }
                    }}
                    placeholder="Workspace name"
                    disabled={creatingSubmitting}
                    className="w-full rounded-card border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[14px] text-white placeholder:text-white/40 focus:border-accent disabled:opacity-60"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={creatingSubmitting || !newWorkspaceName.trim()}
                      className="rounded-card bg-accent px-2.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingSubmitting ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingWorkspace(false);
                        setNewWorkspaceName("");
                        setCreateError(null);
                      }}
                      disabled={creatingSubmitting}
                      className="text-[13.5px] font-medium text-white/50 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setCreatingWorkspace(true)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                  <PlusIcon />
                  Create workspace
                </button>
              )}
            </div>

            <a
              href="/settings"
              role="menuitem"
              onClick={() => {
                setWsMenuOpen(false);
                onNavigate?.();
              }}
              className="block border-t border-white/10 px-3 py-2.5 text-[14px] text-white/60 hover:bg-white/[0.06] hover:text-white"
            >
              Workspace settings
            </a>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        <p className="mb-1.5 px-3 text-[12.5px] font-bold uppercase tracking-wider text-white/30">
          Workspace
        </p>
        {navItems.map((item) => {
          const active =
            item.href === "/workspace"
              ? pathname === "/workspace" || pathname.startsWith("/board")
              : pathname.startsWith(item.href);
          const badge = item.href === "/notifications" ? unreadCount : 0;
          return (
            <a
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={`group flex w-full items-center justify-between rounded-card px-3 py-2 text-[15px] font-medium transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "text-white/70 hover:bg-ink-700 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <item.icon active={active} />
                {item.label}
              </span>
              {badge ? (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[12.5px] font-semibold text-white">
                  {badge}
                </span>
              ) : null}
            </a>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 mt-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2.5 rounded-card px-2 py-2">
          <AvatarCircle avatarUrl={user.avatarUrl} initials={user.initials} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-medium text-white">
              {user.name}
            </p>
            <p className="truncate text-[13.5px] text-white/45">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            aria-label="Log out"
            title="Log out"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card text-white/40 hover:bg-white/10 hover:text-white"
          >
            <LogOutIcon />
          </button>
          <ThemeToggle />
        </div>
      </div>

      {logoutConfirmOpen ? (
        <LogoutConfirmModal
          onClose={() => setLogoutConfirmOpen(false)}
          onConfirm={handleConfirmLogOut}
        />
      ) : null}
    </div>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H9M16 16l4-4-4-4M20 12H9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoardsIcon({ active }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="4" width="18" height="17" rx="2.5" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.7" />
      <path d="M8 4V20" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.7" />
      <path d="M14 4V20" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.7" opacity="0.5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.7" opacity="0.6" />
      <path d="M15.5 13.3c2.3.4 3.8 2.1 4 4.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ChevronsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/40">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
