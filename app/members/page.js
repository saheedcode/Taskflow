"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonBlock } from "@/components/Skeleton";
import { fetchMembers, inviteMember, fetchWorkspace } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { describeApiError } from "@/lib/errorMessages";
import { workspace as fallbackWorkspace } from "@/lib/mockData";

// Backend roles come back upper-case (OWNER / ADMIN / MEMBER).
const ROLE_STYLES = {
  OWNER: "bg-violet-light text-violet",
  ADMIN: "bg-accent-light text-accent-dark",
  MEMBER: "bg-border-soft text-ink-muted",
};
const ROLE_LABELS = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export default function MembersPage() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState(fallbackWorkspace);
  const [session, setSession] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setMembers(null);
    fetchMembers()
      .then(setMembers)
      .catch((err) =>
        setError(
          describeApiError(err, {}, "Couldn't load workspace members. Try again.")
        )
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function loadWorkspace() {
      fetchWorkspace()
        .then((ws) => {
          if (ws) setWorkspace(ws);
        })
        .catch(() => {});
    }
    loadWorkspace();
    // A workspace switch changes which members list applies — reload both.
    window.addEventListener("tf:workspace-changed", loadWorkspace);
    window.addEventListener("tf:workspace-changed", load);
    return () => {
      window.removeEventListener("tf:workspace-changed", loadWorkspace);
      window.removeEventListener("tf:workspace-changed", load);
    };
  }, [load]);

  useEffect(() => {
    setSession(getSession());
  }, []);

  // The workspace object from GET /api/workspaces already carries the
  // current user's own role in it — no need to search the members list
  // for "self" just to answer "can I invite people here".
  const canInvite = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  async function handleInvite(e) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const result = await inviteMember(email);
      if (result.status === "added") {
        setInviteSuccess(`${result.member.name || email} was added to the workspace.`);
        load(); // refetch so the new member shows up, correctly sorted
      } else {
        setInviteSuccess(
          `Invite sent to ${email} — they'll be added automatically once they sign up.`
        );
      }
      setInviteEmail("");
    } catch (err) {
      // Keyed off err.status first, not err.message — the backend's raw
      // message is usually present but generic ("Request failed (409)."),
      // so checking message first (the old behavior here) meant these
      // status-specific cases almost never actually fired.
      setInviteError(
        describeApiError(
          err,
          {
            400: "Enter a valid email address.",
            403: "You don't have permission to invite members here.",
            409: "That person is already a member of this workspace.",
          },
          "Couldn't send that invite. Try again."
        )
      );
    } finally {
      setInviting(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered =
    members && query
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.email.toLowerCase().includes(query)
        )
      : members;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14.5px] font-medium text-accent-dark">
            {workspace.name}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Team &amp; roles
          </h1>
          <p className="text-[15px] text-ink-muted">
            {members ? `${members.length} member${members.length === 1 ? "" : "s"}` : "Loading members..."}
          </p>
        </div>

        {/* Invite panel */}
        {canInvite ? (
          <form
            onSubmit={handleInvite}
            className="mt-5 flex flex-col gap-3 rounded-panel border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label htmlFor="inviteEmail" className="mb-1.5 block text-[14px] font-semibold text-ink-muted">
                Invite by email
              </label>
              <input
                id="inviteEmail"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                disabled={inviting}
                className="w-full rounded-card border border-border bg-canvas px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="shrink-0 rounded-card bg-accent px-4 py-2 text-[14.5px] font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviting ? "Sending..." : "Send invite"}
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-panel border border-border bg-surface px-4 py-3 text-[14px] text-ink-faint">
            Only owners and admins can invite new members.
          </p>
        )}

        {canInvite ? (
          <p className="mt-2 text-[13.5px] text-ink-faint">
            New teammates always join as <span className="font-semibold">Member</span> — inviting
            directly as Admin isn&rsquo;t supported yet.
          </p>
        ) : null}

        {inviteError ? (
          <div className="mt-3">
            <ErrorBanner message={inviteError} onRetry={() => setInviteError(null)} retryLabel="Dismiss" />
          </div>
        ) : null}
        {inviteSuccess ? (
          <p className="mt-3 rounded-card border border-success/30 bg-success-light px-3 py-2 text-[14px] font-medium text-success">
            {inviteSuccess}
          </p>
        ) : null}

        <div className="relative mt-6 max-w-xs">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            className="w-full rounded-card border border-border bg-canvas py-1.5 pl-8 pr-3 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface"
          />
        </div>

        {error ? (
          <div className="mt-6">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        ) : members === null ? (
          <div className="mt-6 divide-y divide-border rounded-card border border-border bg-surface" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <SkeletonBlock className="h-10 w-10 !rounded-full" />
                <div className="flex-1">
                  <SkeletonBlock className="h-3.5 w-1/3" />
                  <SkeletonBlock className="mt-2 h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-[15px] text-ink-faint">
            No members match &ldquo;{search.trim()}&rdquo;.
          </p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-panel border border-border bg-surface shadow-card">
            {filtered.map((m) => {
              const isSelf = session && m.id === session.id;
              const roleKey = (m.role || "MEMBER").toUpperCase();
              return (
                <div key={m.id} className="flex items-center gap-3 border-b border-border-soft px-4 py-3.5 last:border-0">
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13.5px] font-semibold text-white"
                    >
                      {initialsFor(m.name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {m.name}
                      {isSelf ? <span className="ml-1.5 text-[13.5px] font-normal text-ink-faint">(you)</span> : null}
                    </p>
                    <p className="truncate text-[14px] text-ink-faint">{m.email}</p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-bold ${
                      ROLE_STYLES[roleKey] || ROLE_STYLES.MEMBER
                    }`}
                  >
                    {ROLE_LABELS[roleKey] || m.role}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {members && members.length ? (
          <p className="mt-3 text-[13.5px] text-ink-faint">
            Changing a member&rsquo;s role or removing them from the workspace isn&rsquo;t supported yet.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PermCard
            badgeClass={ROLE_STYLES.OWNER}
            role="Owner"
            items={["Manage billing & workspace", "Delete the workspace", "Rename or invite members"]}
          />
          <PermCard
            badgeClass={ROLE_STYLES.ADMIN}
            role="Admin"
            items={["Create & archive boards", "Invite members", "Rename the workspace"]}
          />
          <PermCard
            badgeClass={ROLE_STYLES.MEMBER}
            role="Member"
            items={["Create & edit cards", "Comment & assign tasks", "Cannot manage members"]}
          />
        </div>
      </div>
    </AppShell>
  );
}

function initialsFor(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function PermCard({ badgeClass, role, items }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-4">
      <span className={`inline-block rounded-full px-2.5 py-1.5 text-[13px] font-bold ${badgeClass}`}>
        {role}
      </span>
      <ul className="mt-2.5 space-y-1.5 text-[13.5px] leading-relaxed text-ink-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="text-ink-faint">&middot;</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
    >
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
