"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { getSession } from "@/lib/auth";
import { priorities } from "@/lib/priorities";
import { initialsFor, colorForId } from "@/lib/avatar";
import ErrorBanner from "./ErrorBanner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// No session resolved yet (brief moment on first mount) / no session at
// all (e.g. local dev without a backend) — a blank placeholder rather
// than a fabricated mock person, since this is only ever shown for a
// beat before getSession() resolves.
const EMPTY_USER = { id: null, name: "", initials: "" };

function relativeTime(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

// Comment author display: the doc doesn't show a sample GET /comments
// response shape, only the POST body. This tolerates either a flat
// `authorId` or a nested `author` object.
function commentAuthorId(cm) {
  return cm.authorId ?? cm.author?.id ?? null;
}
function commentText(cm) {
  return cm.content ?? cm.text ?? "";
}
function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export default function CardModal({
  card,
  listName,
  listId,
  lists,
  // Real workspace members ({id, name, avatarUrl, email, role}) from
  // GET /api/workspaces/:id/members — used for the assignee picker and
  // to resolve a comment author's name/avatar when it isn't already
  // embedded on the comment. Defaults to empty rather than falling back
  // to fabricated data if the caller hasn't loaded it yet.
  members = [],
  // { cardId, comment } from a comment:created socket event (see
  // KanbanBoard.js's socket wiring) — best-effort, purely additive.
  // Ignored if it's for a different card, or if this comment id is
  // already in `comments` (e.g. the echo of a comment this same client
  // just posted via handleSubmitComment below).
  liveComment,
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  // Free-text labels: the backend has no label entity, cards just carry
  // `labels: string[]`.
  const [labels, setLabels] = useState(card.labels || []);
  const [newLabel, setNewLabel] = useState("");
  // `priority` is a real, persisted backend field (see
  // lib/priorities.js for the lowercase-local <-> uppercase-wire
  // conversion, applied in lib/api.js's updateCard/createCard).
  const [priority, setPriority] = useState(card.priority || "med");
  const [dueDate, setDueDate] = useState(card.dueDate || "");
  // Real cards carry assignees embedded as full {id, name, avatarUrl}
  // objects (GET /api/boards/:id nested card shape) — derive the
  // editable id list from that.
  const [assigneeIds, setAssigneeIds] = useState(
    (card.assignees || []).map((a) => a.id)
  );
  const [targetListId, setTargetListId] = useState(listId);
  // True once the person has actually changed something in this modal.
  // Used two ways: (1) handleClose below skips the PATCH entirely if
  // nothing was touched, instead of always saving on close regardless of
  // whether there's anything to save; (2) the live-resync effect further
  // down only overwrites local state from a fresh `card` prop (e.g. a
  // `card:updated` socket event landing while this modal is open) when
  // the person hasn't started editing — once they have, a live update
  // must NOT clobber their in-progress edit, but by the same token an
  // untouched, still-open modal shouldn't go on to silently overwrite
  // someone else's concurrent change with a stale snapshot on close.
  const [dirty, setDirty] = useState(false);
  const lastCardRef = useRef(card);
  const titleInputRef = useRef(null);
  const [comment, setComment] = useState("");
  // Ids collected via the @mention picker below, in the order picked —
  // this is what actually gets sent as `mentionedUserIds` on submit. The
  // backend doesn't parse "@Name" out of the comment text itself (see the
  // doc's Section 9), so without this, comments would always post with no
  // mention notifications no matter what the person typed.
  const [mentionedIds, setMentionedIds] = useState([]);
  // Non-null while the person is mid-@mention (holds whatever partial
  // name they've typed after the "@") — drives the autocomplete dropdown
  // below the comment input.
  const [mentionQuery, setMentionQuery] = useState(null);
  const commentInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const dialogRef = useRef(null);
  // Real logged-in user (for comment-author gating), resolved from the
  // stored session same as AppShell does.
  const [currentUser, setCurrentUser] = useState(EMPTY_USER);
  useEffect(() => {
    const session = getSession();
    if (session) setCurrentUser(session);
  }, []);

  // Comments aren't embedded on the card object from GET /api/boards/:id
  // (no `comments` field in the nested card shape) — load them on demand
  // the moment the modal opens instead.
  useEffect(() => {
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError(null);
    api
      .fetchComments(card.id)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((err) => {
        if (!cancelled) setCommentsError(err.message || "Couldn't load comments.");
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  // Best-effort live update: append a comment that arrived over the
  // socket while this modal is already open on the same card. REST (the
  // fetchComments load above) remains the source of truth — this never
  // replaces it, just saves a person from having to close/reopen the
  // modal to see someone else's comment land in real time.
  useEffect(() => {
    if (!liveComment || liveComment.cardId !== card.id) return;
    setComments((prev) =>
      prev.some((cm) => cm.id === liveComment.comment.id) ? prev : [...prev, liveComment.comment]
    );
  }, [liveComment, card.id]);

  // Resyncs the editable fields from a fresh `card` prop — e.g. a
  // `card:updated`/`card:moved` socket event updating board.cards while
  // this modal is open on the same card (see KanbanBoard.js's socket
  // handlers). Only when nothing has been edited here yet: once the
  // person starts typing, a concurrent update must not clobber what
  // they're mid-way through. This is what keeps an untouched, still-open
  // modal from later saving a stale snapshot over someone else's edit —
  // see the `dirty` guard in handleClose below for the other half of
  // that fix.
  useEffect(() => {
    if (card === lastCardRef.current) return;
    lastCardRef.current = card;
    if (dirty) return;
    setTitle(card.title);
    setDescription(card.description || "");
    setLabels(card.labels || []);
    setPriority(card.priority || "med");
    setDueDate(card.dueDate || "");
    setAssigneeIds((card.assignees || []).map((a) => a.id));
  }, [card, dirty]);

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  function addLabel() {
    const trimmed = newLabel.trim();
    if (!trimmed || labels.includes(trimmed)) {
      setNewLabel("");
      return;
    }
    markDirty();
    setLabels((prev) => [...prev, trimmed]);
    setNewLabel("");
  }

  function removeLabel(label) {
    markDirty();
    setLabels((prev) => prev.filter((l) => l !== label));
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleting(false);
      setDeleteError(err.message || "Couldn't delete this card.");
    }
  }

  async function handleSubmitComment() {
    const content = comment.trim();
    if (!content) return;
    // Only send ids for people whose @mention is still actually present
    // in the final text — protects against a stale id lingering in
    // mentionedIds if the person picked someone, then deleted that
    // "@Name" from the comment before sending.
    const relevantMentions = mentionedIds.filter((id) => {
      const m = members.find((mm) => mm.id === id);
      return m && content.includes(`@${firstName(m.name)}`);
    });
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const saved = await api.addComment(card.id, { content, mentionedUserIds: relevantMentions });
      setComments((prev) => [...prev, saved]);
      setComment("");
      setMentionedIds([]);
      setMentionQuery(null);
    } catch (err) {
      setCommentError(err.message || "Couldn't post your comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  // Detects an in-progress "@partial" right before the cursor as the
  // person types, so the dropdown below can offer matching workspace
  // members to tag.
  function handleCommentChange(e) {
    const value = e.target.value;
    setComment(value);
    const cursor = e.target.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, cursor);
    const match = uptoCursor.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  // Replaces the in-progress "@partial" with "@FirstName " and records
  // the real user id so it can be sent as mentionedUserIds on submit —
  // this is the one place a mention actually gets resolved to an id,
  // since the backend only trusts ids we hand it, never text it parses
  // itself.
  function selectMention(member) {
    const input = commentInputRef.current;
    const cursor = input?.selectionStart ?? comment.length;
    const uptoCursor = comment.slice(0, cursor);
    const inserted = `@${firstName(member.name)} `;
    const replaced = uptoCursor.replace(/@([a-zA-Z0-9._-]*)$/, inserted);
    const next = replaced + comment.slice(cursor);
    setComment(next);
    setMentionQuery(null);
    setMentionedIds((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    requestAnimationFrame(() => {
      input?.focus();
      const pos = replaced.length;
      input?.setSelectionRange(pos, pos);
    });
  }

  const mentionMatches =
    mentionQuery !== null
      ? members
          .filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];

  // Author-gated client-side to match the backend's 403-for-non-author
  // rule, but still handles a 403 gracefully if it slips through (e.g.
  // stale UI showing the delete affordance).
  async function handleDeleteComment(commentId) {
    setDeletingCommentId(commentId);
    setCommentError(null);
    try {
      await api.deleteComment(commentId);
      setComments((prev) => prev.filter((cm) => cm.id !== commentId));
    } catch (err) {
      setCommentError(err.message || "Couldn't delete that comment.");
    } finally {
      setDeletingCommentId((id) => (id === commentId ? null : id));
    }
  }

  async function attemptSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        ...card,
        title: title.trim() || card.title,
        description,
        labels,
        priority,
        dueDate: dueDate || null,
        assigneeIds,
        listId: targetListId,
      });
      setSaving(false);
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err.message || "Couldn't save your changes.");
    }
  }

  function handleClose() {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    attemptSave();
  }

  // Focus trap: keeps Tab/Shift+Tab cycling inside the dialog, sends focus
  // to the title field the moment it opens (matching the old behavior),
  // wires up Escape to save-and-close, and returns focus to whatever was
  // focused before the modal opened — the card that was clicked or
  // activated with the keyboard — once it closes.
  useFocusTrap({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: titleInputRef,
    onEscape: () => {
      if (confirmingDelete) {
        setConfirmingDelete(false);
        return;
      }
      handleClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-0 sm:items-center sm:p-6">
      <button
        aria-label="Close"
        className="fixed inset-0 -z-10"
        onClick={handleClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Card: ${card.title}`}
        className="min-h-screen w-full bg-surface sm:min-h-0 sm:max-w-2xl sm:rounded-panel sm:shadow-pop"
      >
        <div className="flex items-start justify-between px-6 pt-[22px]">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink-faint">
              {card.code || `#${card.id.slice(-4).toUpperCase()}`}
            </p>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => {
                markDirty();
                setTitle(e.target.value);
              }}
              className="mt-1.5 w-full border-none bg-transparent p-0 font-display text-[20px] font-bold text-ink outline-none"
            />
            <p className="mt-1 text-[14px] text-ink-muted">
              in <strong className="font-semibold text-ink">{listName}</strong>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete card"
                disabled={saving || deleting}
                className="flex h-9 w-9 items-center justify-center rounded-card text-ink-faint hover:bg-danger-light hover:text-danger disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close card"
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-card text-ink-faint hover:bg-canvas hover:text-ink disabled:opacity-40"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {confirmingDelete ? (
          <div className="mx-6 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/30 bg-danger-light px-3.5 py-2.5">
            <p className="text-[14px] font-medium text-danger">
              Delete this card? This can't be undone.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-card px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-muted hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-card bg-danger px-2.5 py-1.5 text-[13.5px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete card"}
              </button>
            </div>
          </div>
        ) : null}
        {deleteError ? (
          <div className="mx-6 mt-3">
            <ErrorBanner message={deleteError} onRetry={handleDelete} retryLabel="Try again" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 px-6 py-4 sm:grid-cols-[1fr_200px]">
          {/* Main column */}
          <div className="min-w-0">
            {saveError ? (
              <div className="mb-4">
                <ErrorBanner message={saveError} onRetry={attemptSave} retryLabel="Try again" />
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Description
              </p>
              <textarea
                value={description}
                onChange={(e) => {
                  markDirty();
                  setDescription(e.target.value);
                }}
                placeholder="Add a more detailed description..."
                rows={4}
                className="w-full rounded-card border border-border bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent"
              />
            </div>

            <div className="mt-[18px]">
              <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Comments
              </p>
              <div className="space-y-3">
                {commentsLoading ? (
                  <p className="text-[13.5px] text-ink-faint">Loading comments&hellip;</p>
                ) : commentsError ? (
                  <ErrorBanner
                    message={commentsError}
                    onRetry={() => {
                      setCommentsLoading(true);
                      setCommentsError(null);
                      api
                        .fetchComments(card.id)
                        .then(setComments)
                        .catch((err) => setCommentsError(err.message || "Couldn't load comments."))
                        .finally(() => setCommentsLoading(false));
                    }}
                    retryLabel="Try again"
                  />
                ) : comments.length ? (
                  comments.map((cm) => {
                    const authorId = commentAuthorId(cm);
                    const author = cm.author || members.find((m) => m.id === authorId);
                    const canDelete = authorId && authorId === currentUser.id;
                    return (
                      <div key={cm.id} className="flex items-start gap-2.5">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold text-white"
                          style={{ backgroundColor: colorForId(authorId) }}
                        >
                          {author?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initialsFor(author?.name) || "?"
                          )}
                        </span>
                        <div className="flex-1 rounded-card bg-canvas px-3 py-2 text-[14px] leading-relaxed">
                          <p className="mb-0.5 flex items-baseline gap-1.5 text-[13.5px] font-bold text-ink">
                            {author?.name || "Team member"}
                            {cm.createdAt ? (
                              <span className="text-[12.5px] font-medium text-ink-faint">
                                {relativeTime(cm.createdAt)}
                              </span>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(cm.id)}
                                disabled={deletingCommentId === cm.id}
                                className="ml-auto text-[12.5px] font-semibold text-ink-faint hover:text-danger disabled:opacity-50"
                              >
                                {deletingCommentId === cm.id ? "Deleting..." : "Delete"}
                              </button>
                            ) : null}
                          </p>
                          {commentText(cm)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[13.5px] text-ink-faint">No comments yet.</p>
                )}
              </div>

              {commentError ? (
                <div className="mt-3">
                  <ErrorBanner message={commentError} onRetry={handleSubmitComment} retryLabel="Try again" />
                </div>
              ) : null}

              <div className="relative mt-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
                  {currentUser.initials}
                </span>
                <input
                  ref={commentInputRef}
                  type="text"
                  value={comment}
                  onChange={handleCommentChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mentionMatches.length === 0) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                  }}
                  onBlur={() => {
                    // Slight delay so a click on a dropdown option (which
                    // blurs the input first) still registers before the
                    // dropdown unmounts.
                    setTimeout(() => setMentionQuery(null), 150);
                  }}
                  placeholder="Write a comment... (@ to mention someone)"
                  disabled={commentSubmitting}
                  className="flex-1 rounded-full border border-border px-3.5 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent disabled:opacity-60"
                />
                {mentionMatches.length > 0 ? (
                  <div
                    role="listbox"
                    aria-label="Mention a member"
                    className="absolute bottom-[calc(100%+6px)] left-[42px] z-10 w-56 overflow-hidden rounded-card border border-border bg-surface shadow-pop"
                  >
                    {mentionMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        // onMouseDown (not onClick) fires before the
                        // input's onBlur above, so selecting a match
                        // doesn't get raced by the dropdown closing first.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectMention(m);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-ink hover:bg-canvas"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: colorForId(m.id) }}
                        >
                          {initialsFor(m.name)}
                        </span>
                        <span className="truncate">{m.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Side column */}
          <div className="space-y-[18px]">
            {lists?.length ? (
              <div>
                <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                  List
                </p>
                <select
                  value={targetListId}
                  onChange={(e) => {
                    markDirty();
                    setTargetListId(e.target.value);
                  }}
                  className="w-full rounded-card border border-border bg-surface px-2.5 py-2 text-[14.5px] text-ink focus:border-accent"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[13px] text-ink-faint sm:hidden">
                  Move a card between lists here on touch devices.
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Priority
              </p>
              <select
                value={priority}
                onChange={(e) => {
                  markDirty();
                  setPriority(e.target.value);
                }}
                className="w-full rounded-card border border-border bg-surface px-2.5 py-2 text-[14.5px] text-ink focus:border-accent"
              >
                {Object.entries(priorities).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Due date
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    markDirty();
                    setDueDate(e.target.value);
                  }}
                  className="w-full rounded-card border border-border bg-surface px-2.5 py-2 text-[14.5px] text-ink focus:border-accent"
                />
              </div>
              {dueDate ? (
                <button
                  type="button"
                  onClick={() => {
                    markDirty();
                    setDueDate("");
                  }}
                  className="mt-1 text-[13.5px] text-ink-faint hover:text-ink"
                >
                  Clear date
                </button>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Labels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {labels.length === 0 ? (
                  <p className="text-[13.5px] text-ink-faint">No labels yet.</p>
                ) : null}
                {labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-2.5 py-1.5 text-[13px] font-bold text-accent-dark"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeLabel(label)}
                      aria-label={`Remove label ${label}`}
                      className="text-accent-dark/60 hover:text-accent-dark"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add a label..."
                  className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-accent"
                />
                <button
                  type="button"
                  onClick={addLabel}
                  disabled={!newLabel.trim()}
                  className="shrink-0 rounded-card border border-border px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Assignees
              </p>
              <div className="space-y-0.5">
                {members.length === 0 ? (
                  <p className="px-1.5 py-1.5 text-[13.5px] text-ink-faint">
                    No workspace members loaded.
                  </p>
                ) : null}
                {members.map((m) => {
                  const active = assigneeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        markDirty();
                        setAssigneeIds((prev) =>
                          prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                        );
                      }}
                      className={`flex w-full items-center gap-2 rounded-card px-1.5 py-1.5 text-left transition-colors ${
                        active ? "bg-accent-light" : "hover:bg-canvas"
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold text-white"
                        style={{ backgroundColor: colorForId(m.id) }}
                      >
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initialsFor(m.name)
                        )}
                      </span>
                      <span className="truncate text-[14px] text-ink">{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-soft px-6 py-4">
          {saving ? <span className="text-[14px] text-ink-faint">Saving&hellip;</span> : null}
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-card bg-accent px-4 py-2 text-[14.5px] font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1A2 2 0 0 1 14.2 21H9.8a2 2 0 0 1-2-1.9L7 7h10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
