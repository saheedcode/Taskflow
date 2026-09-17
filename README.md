# TaskFlow — Frontend

Next.js (App Router) + JavaScript + Tailwind CSS frontend for the TaskFlow
PRD, built against a real backend (see the API doc). Auth, workspaces,
members, boards (including the workspace boards grid), lists, cards
(including priority), comments, mentions, notifications, avatar upload,
and real-time updates (Socket.io) all talk to the live backend — there's
no locally-mocked data layer left in the app's normal flow.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/login` (or `/workspace` if
you're already signed in).

Set `NEXT_PUBLIC_API_URL` in `.env.local` (copy from `.env.example`) to
point at the backend — `http://localhost:5000` for a locally-running
backend, or the deployed URL for the live one. **Cold starts:** the live
backend runs on a free instance that spins down when idle, so the first
request after a quiet period can take 30–60 seconds to respond. That's
expected behavior, not a bug — the app's request timeout is set to 65s to
account for it (see `lib/apiClient.js`).

Sign up for a real account (or use whatever demo credentials your backend
has seeded, if any) — accounts are real backend accounts now, not
localStorage entries.

## What's built

### Auth (`lib/auth.js`, `middleware.js`)

A full auth flow against the real backend:

- **Sign up** (`/signup`) — validated (name, email format, password length,
  confirm-password match, terms checkbox), creates a real account via
  `POST /api/auth/signup`.
- **Log in** (`/login`) — validated, "remember me" (30-day vs 8-hour
  session), redirects back to whatever page you were trying to reach
  (`?next=`) after login.
- **Email verification** — new accounts start unverified; `AppShell.js`
  shows a dismissible banner with a resend action
  (`POST /api/auth/resend-verification`) until the account is verified.
  Nothing in the app is currently gated on verification.
- **Forgot password** (`/forgot-password`) — request a reset link. Always
  shows the same "check your email" confirmation whether or not the
  account exists, matching the backend's behavior of never revealing
  whether an email is registered.
- **Reset password** (`/reset-password?token=...`) — new password + confirm,
  handles missing/expired/invalid tokens with a real error state.
- **Log out** — from the sidebar (desktop) or the account menu drawer
  (mobile, via the top-bar avatar or bottom-tab Profile button).
- **Route protection** (`middleware.js`) — `/workspace` and `/board/*`
  redirect to `/login` if there's no session cookie; `/login` and `/signup`
  redirect signed-in users to `/workspace`.
- Password fields have a show/hide toggle (`components/PasswordField.js`),
  and every form has real inline validation, a loading state on submit, and
  an error banner for failures — no dead-end forms.

The JWT is stored client-side (see `lib/apiClient.js`) and attached as
`Authorization: Bearer <token>` on every authenticated request; tokens
expire after 7 days per the backend, and an expired/invalid token triggers
a global session-expired redirect (`components/SessionExpiryWatcher.js`)
instead of leaving individual pages stuck on a generic error.

### App

- **Workspace dashboard** — `/workspace`. Grid of boards with a "create
  board" affordance, loaded from the real `GET /api/workspaces/:id/boards`
  endpoint (server-computed `cardCount`, so a zero-card board still shows
  up correctly). No per-board "done vs. total" progress or member-avatar
  row yet, since the backend doesn't expose either at the board-list
  level — `BoardCard.js` hides those rather than fabricating them.
- **Board view** — `/board/[boardId]`. Kanban lists and cards, loaded and
  saved via the real API (`GET /api/boards/:id`, list/card CRUD endpoints):
  - Drag-and-drop cards between/within lists (native HTML5 DnD, no
    external library), plus a full keyboard-operable alternative (Space to
    pick up a card, arrow keys to move it, Space/Enter to drop, Escape to
    cancel). Reordering uses float `position` values so items can be
    inserted between existing ones without renumbering the rest.
  - Add, rename, and **delete** lists; add, edit, and **delete** cards
    (both gated behind a confirm dialog — `components/ConfirmModal.js` —
    and delete is hidden for `MEMBER`s, since the backend restricts it to
    `OWNER`/`ADMIN`).
  - Board settings menu (next to the board name in the topbar): rename,
    change color, or delete the whole board.
  - Click a card to open the detail modal: title, description, due date,
    priority, assignees (from the workspace's real member list),
    free-text labels added/removed directly on the card, and a comment
    thread with @-mention autocomplete that resolves to real member IDs
    (`mentionedUserIds`) for mention notifications.
  - Recent board activity (`GET /api/boards/:id/activity`) in the side
    rail — this is board-level only; there's no per-card activity
    endpoint, so the card modal doesn't show one.
  - Presence avatars + "Live" indicator in the header, backed by real
    Socket.io `presence:sync` events (`hooks/useBoardSocket.js`).
- **Workspace-wide search** — `/search`. Filters cards across every board
  in the workspace by text, assignee, label, and due-date range
  (`GET /api/workspaces/:id/search`), paginated 25 results at a time with
  a "Load more" control backed by the endpoint's `{ items, total,
  hasMore }` response.
- **Notifications** — `/notifications`. Card assignment, @-mention, and
  due-soon alerts, with mark-read / mark-all-read actions.
- **Team & roles** — `/members`. Lists workspace members with their role;
  `OWNER`/`ADMIN` can invite by email. Changing or removing a member's
  role isn't supported by the backend yet, so there's no control for it
  here either.
- **Profile & avatar** — `/settings`. Rename, and upload/remove a profile
  photo (cropped server-side to a 400×400 square).
- **Responsive shell** (`components/AppShell.js`):
  - Desktop: fixed dark sidebar with workspace switcher, nav, user footer,
    logout.
  - Mobile: top bar with a hamburger that opens a slide-in menu drawer,
    plus a bottom tab bar for primary navigation.

## Known limitations

- **`lib/mockData.js`** — no longer the data layer (see "What's built"
  above; workspace board listing now comes from the real
  `GET /api/workspaces/:id/boards` endpoint like everything else), but a
  few components still import fallback/placeholder values from it for the
  brief moment before real data has loaded, and `lib/api.js` still uses
  it to seed a local `BOARD_DETAILS_KEY` bridge that the card/list
  functions read and write to avoid a full board refetch after every
  mutation. Confirmed current importers: `components/AppShell.js`,
  `components/BoardCard.js`, `components/KanbanBoard.js`,
  `components/NavContent.js`, `app/settings/page.js`,
  `app/members/page.js`, `app/workspace/page.js`, and `lib/api.js`
  itself.

## Notes

- No component libraries for drag-and-drop — native HTML5 drag events, so
  there's nothing extra to install. Swap in `@hello-pangea/dnd` or similar
  later if you want touch-friendly reordering on mobile.
- Design tokens (colors, type) live in `tailwind.config.js`.

## Production plumbing

- **Error/404/loading boundaries** — `app/error.js` (route-level errors),
  `app/global-error.js` (root-layout failures — has to render its own
  `<html>`/`<body>` since it can't rely on the layout it's replacing),
  `app/not-found.js`, and `app/loading.js`, all styled to match the app
  instead of falling back to Next.js's default overlays.
- **Favicon & manifest** — `app/icon.svg` (Next's App Router auto-detects
  this as the favicon) and `app/manifest.js` for basic installability.
- **Metadata** — `app/layout.js` sets a title template, description,
  robots (`noindex` — this is a signed-in app, not marketing content), and
  `metadataBase` for absolute URLs.
- **Env seams** — `.env.example` documents `NEXT_PUBLIC_API_URL` (the
  backend base URL, read by `lib/apiClient.js` on every request) and
  `NEXT_PUBLIC_SITE_URL` (used for absolute URLs in metadata). Real-time
  updates connect over the same origin as `NEXT_PUBLIC_API_URL` — there's
  no separate WebSocket URL to configure.
- **`.gitignore`** — was missing entirely; added the standard Next.js one.
