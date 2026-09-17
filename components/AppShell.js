"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import NavContent from "./NavContent";
import LogoMark from "./Logo";
import AvatarCircle from "./AvatarCircle";
import { currentUser as fallbackUser } from "@/lib/mockData";
import { getSession, refreshSession, resendVerificationEmail } from "@/lib/auth";
import { fetchNotifications } from "@/lib/api";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export default function AppShell({ children, headerRight }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(fallbackUser);
  const [unreadCount, setUnreadCount] = useState(0);
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent | error
  const menuDrawerRef = useRef(null);

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session);
    // Revalidate against the backend so a just-verified email (clicked in
    // another tab) or any other server-side change shows up without a
    // full reload.
    refreshSession();

    function onSessionUpdated(e) {
      if (e.detail) setUser(e.detail);
    }
    window.addEventListener("tf:session-updated", onSessionUpdated);
    return () => window.removeEventListener("tf:session-updated", onSessionUpdated);
  }, []);

  async function handleResendVerification() {
    setResendState("sending");
    try {
      await resendVerificationEmail();
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  const showVerifyBanner =
    user && user.emailVerified === false && !verifyBannerDismissed;

  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((list) => {
        if (!cancelled) setUnreadCount(list.filter((n) => n.unread).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useFocusTrap({
    active: menuOpen,
    containerRef: menuDrawerRef,
    onEscape: () => setMenuOpen(false),
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-ink-900 md:block">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-card text-ink hover:bg-canvas"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="flex items-center gap-1.5 font-display text-[16px] font-semibold tracking-tight text-ink">
          <LogoMark size={18} />
          TaskFlow
        </span>
        <button
          type="button"
          aria-label="Open account menu"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full"
        >
          <AvatarCircle avatarUrl={user.avatarUrl} initials={user.initials} size="sm" />
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink-900/50"
          />
          <div
            ref={menuDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Account menu"
            className="absolute inset-y-0 left-0 w-72 max-w-[82%] overflow-y-auto bg-ink-900 shadow-pop"
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-card text-white/60 hover:bg-white/10 hover:text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavContent onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Main content */}
      <div className="md:pl-64">
        {showVerifyBanner ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-light px-4 py-2.5 text-[14.5px] text-accent-dark md:px-6">
            <span className="flex-1">
              {resendState === "sent"
                ? "Verification email sent — check your inbox."
                : "Verify your email to make sure you don't lose access to your account."}
            </span>
            {resendState !== "sent" ? (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendState === "sending"}
                className="shrink-0 font-medium underline decoration-accent-dark/40 underline-offset-2 hover:decoration-accent-dark disabled:opacity-60"
              >
                {resendState === "sending" ? "Sending..." : "Resend email"}
              </button>
            ) : null}
            {resendState === "error" ? (
              <span className="shrink-0 text-danger">Couldn't send it — try again.</span>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setVerifyBannerDismissed(true)}
              className="shrink-0 text-accent-dark/60 hover:text-accent-dark"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}
        {headerRight ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border bg-surface px-4 py-3 md:px-6">
            {headerRight}
          </div>
        ) : null}
        <main>{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <TabButton
          label="Boards"
          active={pathname === "/workspace" || pathname.startsWith("/board")}
          onClick={() => router.push("/workspace")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 4V20" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </TabButton>
        <TabButton
          label="Search"
          active={pathname.startsWith("/search")}
          onClick={() => router.push("/search")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </TabButton>
        <TabButton
          label="Alerts"
          active={pathname.startsWith("/notifications")}
          badge={unreadCount}
          onClick={() => router.push("/notifications")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </TabButton>
        <TabButton label="Profile" onClick={() => setMenuOpen(true)}>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-[21px] w-[21px] rounded-full object-cover"
            />
          ) : (
            <span className="flex h-[21px] w-[21px] items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
              {user.initials[0]}
            </span>
          )}
        </TabButton>
      </nav>

      {/* Spacer so bottom tab bar never covers content on mobile */}
      <div className="h-14 md:hidden" />
    </div>
  );
}

function TabButton({ label, children, active, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium ${
        active ? "text-accent" : "text-ink-faint"
      }`}
    >
      {children}
      {label}
      {badge ? (
        <span className="absolute right-1.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
