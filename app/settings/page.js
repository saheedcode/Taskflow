"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorBanner from "@/components/ErrorBanner";
import AppShell from "@/components/AppShell";
import AvatarUploader from "@/components/AvatarUploader";
import ConfirmModal from "@/components/ConfirmModal";
import { fetchWorkspace, updateWorkspaceName, deleteWorkspace } from "@/lib/api";
import { getSession, updateProfile, uploadAvatar, removeAvatar } from "@/lib/auth";
import { describeApiError } from "@/lib/errorMessages";
import { currentUser as fallbackUser } from "@/lib/mockData";

export default function SettingsPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(null); // full object incl. id + role
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState(null);
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [session, setSession] = useState(fallbackUser);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);

  function loadWorkspace() {
    fetchWorkspace()
      .then((ws) => {
        if (ws) {
          setWorkspace(ws);
          setWorkspaceName(ws.name);
        }
        setWorkspaceLoaded(true);
      })
      .catch(() => setWorkspaceLoaded(true));
  }

  useEffect(() => {
    loadWorkspace();
    // The active workspace can change from the sidebar switcher while this
    // page is open — keep the form in sync rather than showing stale data.
    window.addEventListener("tf:workspace-changed", loadWorkspace);

    const session = getSession() || fallbackUser;
    setSession(session);
    setProfileName(session.name);

    return () => window.removeEventListener("tf:workspace-changed", loadWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PATCH /api/workspaces/:id requires OWNER or ADMIN; DELETE requires
  // OWNER. Gate the UI on the role the backend already returns rather than
  // just letting rename/delete fail server-side for everyone else.
  const canRename = workspace?.role === "OWNER" || workspace?.role === "ADMIN";
  const canDelete = workspace?.role === "OWNER";

  async function handleSaveWorkspace(e) {
    e.preventDefault();
    const name = workspaceName.trim();
    if (!name || !canRename) return;
    setSavingWorkspace(true);
    setWorkspaceError(null);
    setWorkspaceSaved(false);
    try {
      const updated = await updateWorkspaceName(name);
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : updated));
      setWorkspaceSaved(true);
    } catch (err) {
      // canRename already keeps this button/input disabled for non
      // owners/admins, but the doc's PATCH /api/workspaces/:id still
      // 403s server-side if that's ever bypassed — show a clear message
      // rather than whatever raw text the backend sends.
      setWorkspaceError(
        describeApiError(
          err,
          { 403: "Only owners and admins can rename this workspace." },
          "Couldn't save workspace settings."
        )
      );
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleDeleteWorkspace() {
    try {
      await deleteWorkspace(workspace.id);
    } catch (err) {
      // Same bypass scenario as rename above — canDelete already hides
      // this control for non-owners, but map the message before
      // ConfirmModal displays it, rather than a raw backend string.
      throw new Error(
        describeApiError(
          err,
          { 403: "Only the workspace owner can delete it." },
          "Couldn't delete this workspace."
        )
      );
    }
    setDeleteModalOpen(false);
    // The workspace this page was showing no longer exists — deleteWorkspace()
    // already switched the active workspace elsewhere, so land back on the
    // (now-current) boards grid rather than showing a settings page for a
    // workspace that's gone.
    router.push("/workspace");
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    const name = profileName.trim();
    if (!name) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const updated = await updateProfile({ name });
      setSession(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err.message || "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveAvatar(file) {
    // AvatarUploader passes a File to upload, or null to remove.
    const updated = file ? await uploadAvatar(file) : await removeAvatar();
    setSession(updated);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 md:py-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14.5px] font-medium text-accent-dark">Preferences</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Settings
          </h1>
        </div>

        {/* Workspace */}
        <section className="mt-6 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-[16px] font-semibold text-ink">
            Workspace
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-faint">
            The name shown in the sidebar and workspace switcher.
          </p>
          <form onSubmit={handleSaveWorkspace} className="mt-4">
            {workspaceError ? (
              <div className="mb-3">
                <ErrorBanner
                  message={workspaceError}
                  onRetry={handleSaveWorkspace}
                  retryLabel="Try again"
                />
              </div>
            ) : null}
            <label className="mb-1.5 block text-[14.5px] font-medium text-ink-faint">
              Workspace name
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={workspaceName}
                onChange={(e) => {
                  setWorkspaceName(e.target.value);
                  setWorkspaceSaved(false);
                }}
                disabled={!workspaceLoaded || !canRename}
                className="min-w-[220px] flex-1 rounded-card border border-border bg-canvas px-3 py-2 text-[15px] text-ink focus:border-accent disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={savingWorkspace || !workspaceName.trim() || !canRename}
                className="rounded-card bg-accent px-3.5 py-2 text-[14.5px] font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingWorkspace ? "Saving..." : "Save"}
              </button>
              {workspaceSaved && !savingWorkspace ? (
                <span className="text-[14px] font-medium text-success">Saved</span>
              ) : null}
            </div>
            {workspaceLoaded && !canRename ? (
              <p className="mt-2 text-[13.5px] text-ink-faint">
                Only owners and admins can rename this workspace.
              </p>
            ) : null}
          </form>

          {canDelete ? (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-[14.5px] font-semibold text-danger">Danger zone</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-faint">
                Deleting this workspace permanently removes it and everything inside
                it — every board, list, card, and comment. This can&rsquo;t be undone.
              </p>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="mt-3 rounded-card border border-danger/30 bg-danger-light px-3.5 py-2 text-[14.5px] font-medium text-danger hover:brightness-95"
              >
                Delete workspace
              </button>
            </div>
          ) : null}
        </section>

        {deleteModalOpen && workspace ? (
          <ConfirmModal
            title={`Delete "${workspace.name}"?`}
            description="This permanently deletes the workspace and every board, list, card, and comment inside it. This can't be undone."
            confirmLabel="Delete workspace"
            confirmingLabel="Deleting..."
            tone="danger"
            onConfirm={handleDeleteWorkspace}
            onClose={() => setDeleteModalOpen(false)}
          />
        ) : null}

        {/* Profile */}
        <section className="mt-4 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-[16px] font-semibold text-ink">
            Your profile
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-faint">
            Your display name, shown on cards and comments.
          </p>

          <div className="mt-4 border-b border-border pb-5">
            <AvatarUploader
              avatarUrl={session.avatarUrl}
              initials={session.initials}
              onSave={handleSaveAvatar}
            />
          </div>

          <form onSubmit={handleSaveProfile} className="mt-5">
            {profileError ? (
              <div className="mb-3">
                <ErrorBanner
                  message={profileError}
                  onRetry={handleSaveProfile}
                  retryLabel="Try again"
                />
              </div>
            ) : null}
            <label className="mb-1.5 block text-[14.5px] font-medium text-ink-faint">
              Full name
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  setProfileSaved(false);
                }}
                className="min-w-[220px] flex-1 rounded-card border border-border bg-canvas px-3 py-2 text-[15px] text-ink focus:border-accent"
              />
              <button
                type="submit"
                disabled={savingProfile || !profileName.trim()}
                className="rounded-card bg-accent px-3.5 py-2 text-[14.5px] font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save"}
              </button>
              {profileSaved && !savingProfile ? (
                <span className="text-[14px] font-medium text-success">Saved</span>
              ) : null}
            </div>
          </form>
        </section>

        {/* Notification preferences */}
        <section className="mt-4 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-[16px] font-semibold text-ink">
            Notifications
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-faint">
            The backend doesn't support per-person notification preferences yet — every
            trigger type below is on for everyone, and there's nothing to save here. This
            list is shown as-is (not editable toggles) so it doesn't imply a control that
            doesn't actually do anything.
          </p>
          <div className="mt-4 divide-y divide-border">
            <PrefRow
              label="Card assignments"
              description="When someone assigns you to a card."
            />
            <PrefRow
              label="@Mentions"
              description="When someone @-mentions you in a comment."
            />
            <PrefRow
              label="Due date reminders"
              description="Once daily, for cards you're assigned that are due within 24 hours."
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PrefRow({ label, description }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div>
        <p className="text-[15px] font-medium text-ink">{label}</p>
        <p className="text-[14px] text-ink-faint">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-border-soft px-2.5 py-1 text-[13px] font-semibold text-ink-muted">
        Always on
      </span>
    </div>
  );
}
