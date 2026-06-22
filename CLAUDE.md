# Majority — Music Discovery by Real People

Majority is a music discovery app where real humans vote on emerging songs. 
Instead of algorithms deciding what's popular, the community votes. Users swipe 
through 30-second previews of new-release songs (sourced from Deezer's public 
feed), Pass or Like, and watch a live leaderboard of what the crowd actually likes.

**Live:** https://majority-eight.vercel.app · **Repo:** github.com/kjohns4/majority

## Architecture (one writer, many fast readers)
```
Daily cron ──Bearer CRON_SECRET──▶ /api/songs ──▶ Deezer ──▶ Supabase upsert   (write, once/day)
Every visitor ───────────────────▶ Supabase SELECT (7-day window)              (read, instant)
Play a track ────────────────────▶ /api/preview ──▶ fresh Deezer preview URL   (per play)
Vote ────────────────────────────▶ Supabase insert (anon, RLS)
```
- The client never calls `/api/songs` on page load — it reads songs straight from Supabase.
- `/api/songs` is the seeding endpoint, run on a schedule (Vercel Cron) and secured by `CRON_SECRET`.

## Stack
- **Frontend:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS v4
- **Backend/Database/Auth:** Supabase (Postgres, anonymous voting)
- **Deployment:** Vercel
- **Data:** Deezer public API (new releases + 30s previews, no auth). NOTE: pivoted
  off Spotify — its Web API now requires the app owner to have Premium (403s otherwise).

## Folder Structure
```
api/
  songs.ts            # Serverless (Node): Deezer new releases -> Supabase upsert (SEEDER, cron)
  preview.ts          # Serverless (Node): fresh signed Deezer preview URL for a track
src/
  components/
    SongCard.tsx      # Cover art + full-cover play/pause + Pass/Like (locked until played)
    Leaderboard.tsx   # Top 10 by score; displays rank only (no vote counts)
    Navigation.tsx    # Discover / Leaderboard toggle
  pages/
    CardView.tsx      # Discover deck manager
    LeaderboardView.tsx
  lib/
    supabase.ts       # Supabase anon client init
    catalog.ts        # fetchEmergingSongs (Supabase read) + resolvePreview (fresh URL)
    voting.ts         # castVote: insert {song_id, vote, ip_hash}
  types/index.ts      # shared types + snake_case->camelCase row mapper
vercel.json           # Cron: daily POST/GET to /api/songs
.env.local            # Supabase URL/keys, service-role key (git-ignored)
```
NOTE: Vercel's Node runtime invokes /api functions as `(req, res)` — NOT the web
`Request`/`Response` signature. Both functions write via `res`, not by returning.

## Supabase Schema

### `songs` table
```sql
id (UUID, PK)
spotify_id (TEXT, unique)
title (TEXT)
artist (TEXT)
album_art_url (TEXT)
preview_url (TEXT)
created_at (TIMESTAMP)
```

RLS Policy: `SELECT` enabled for anonymous users (read-only)

### `votes` table
```sql
id (UUID, PK)
song_id (UUID, FK → songs.id)
vote (INT: 1 for upvote, -1 for downvote)
ip_hash (TEXT) — anonymized IP for duplicate prevention
created_at (TIMESTAMP)
```

RLS Policy: `INSERT` enabled for anonymous users with ip_hash validation

## Status — MVP shipped & live (2026-06-10)
All acceptance criteria met; deployed to production at https://majority-eight.vercel.app

### Acceptance Criteria
- [x] Fetch ~50 songs from a new-releases feed (Deezer, server-side via `/api/songs`)
- [x] Display one song card at a time: album art, title, artist, play button (30-sec preview)
- [x] Vote buttons (Pass / Like) store vote in Supabase
- [x] Leaderboard view shows top 10 by vote count (realtime + polling fallback)
- [x] Navigation between card view and leaderboard
- [x] Deployed to Vercel, live URL working — **https://majority-eight.vercel.app**

### Status (2026-06-12)
- **Live on Vercel** at https://majority-eight.vercel.app — **auto-deploys on push to
  `main`** (verified repeatedly on 2026-06-11/12); env vars set in Production.
- Supabase tables created (with an added `votes` SELECT policy for the leaderboard).
- Catalog seeded — **50 songs, all with previews**.
- Verified end-to-end (local `vercel dev` + production): `/api/preview` 200, anon read
  of songs + anon vote INSERT both work.
- **Merged (2026-06-12):** `feat/majority-mvp` fully into `main` — restored the
  full-cover play/pause + listen-to-vote lock, daily cron reseeding (`vercel.json` +
  `CRON_SECRET` gate on `/api/songs`), and read-only Discover (client reads Supabase
  directly; `/api/songs` is cron-only now).
- **Fixed (2026-06-11):** `/api/songs` and `/api/preview` were timing out / 500ing —
  see the "API handlers must use Node `(req, res)` signature" gotcha below.
- (Optional) enable Realtime on `votes` for instant leaderboard (else 8s polling fallback).

### Completed work
- Tasks 1–7: Supabase client, catalog, SongCard, voting, leaderboard, nav, styling
- Task 8: deployed to Vercel, prod env vars set
- Catalog pivot Spotify → Deezer (Spotify API now needs owner Premium)
- Preview-URL fix: resolve fresh signed URLs at play time (`/api/preview`)
- Rotation: 7-day Discover read-window (Option D), no deletes
- Daily Vercel Cron reseeds the catalog; `/api/songs` secured by `CRON_SECRET`
- UI: minimalist cream redesign, dreamy serif, zero emojis
- UX: full-cover play/pause; voting locked until the user has listened

## Liked Songs — shipped & live (2026-06-20)
A "Liked Songs" tab where users see every song they've Liked in this browser. Liking a
song (vote = 1) saves a compact snapshot to localStorage; the tab lists them newest-first
and each row plays the 30s preview (fresh signed URL via `/api/preview`). Merged to `main`
(PRs #3–#8) and deployed to production — https://majority-eight.vercel.app.

**Core constraint:** client-side only — clearing the cache loses the list. Acceptable for
MVP; the UI is honest about it. localStorage is read back as *untrusted* (safe JSON parse).

### Delivered
- [x] `src/hooks/useLikedSongs.ts` — localStorage read/write (safe parse, dedupe by id, newest-first)
- [x] Persist a snapshot `{songId, spotifyId, title, artist, albumArtUrl, likedAt}` when a Like is cast (`CardView`)
- [x] `src/components/LikedSongRow.tsx` — lazy, exclusive preview playback per row
- [x] `src/pages/LikedSongsView.tsx` — lists liked songs newest-first, each row plays its preview
- [x] "Liked" tab in `Navigation` + routed in `App` (`View` type extended with `'liked'`)
- [x] Typecheck + lint + build green; one PR per atomic commit (6 stacked PRs)

### No engineer action needed
- 100% client-side: no schema, env var, or Vercel config change — reuses the existing
  `/api/preview` proxy. Production auto-deploys on push to `main`.

## V2 Backlog
- User profiles / authentication (Supabase Auth via magic link)
- Follow tastemakers (curators with good voting history)
- Genre / mood filters
- Artist dashboard (see how many votes your song got)
- Weekly "most voted" email digest
- Vote-aware pruning (delete unvoted stale songs) if the table grows large
- Stronger listen gate (require N seconds played, not just pressing play)
- Real-time vote sync is DONE (Supabase Realtime + 8s polling fallback)

## Known Gotchas
- **API handlers must use the Node `(req, res)` signature** — `api/songs.ts` and
  `api/preview.ts` run on Vercel's Node serverless runtime (no Edge config), so they get
  invoked as `(req, res)`, *not* as web-standard `(request: Request) => Response`. Writing
  them web-style silently breaks them: a returned `Response` is ignored (→ function hangs
  until timeout) and `new URL(req.url)` throws because `req.url` is the relative path. Use
  `req.query` for params and `res.status().json()` to respond. (This was the 2026-06-11
  timeout/500 bug.)
- **`vercel dev` doesn't auto-load server-only vars from `.env.local`** — only Vite's
  `VITE_*` vars get picked up. `/api/songs` needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  in the function's env, so locally launch with them exported (`set -a; . ./.env.local; set +a;
  vercel dev`) or it returns a clean 500. In Production they're set in the Vercel dashboard.
- **Spotify Web API is paywalled** — it now requires the app owner to have Premium
  (every endpoint 403s otherwise). Catalog pivoted to Deezer's public API (no auth).
- **`spotify_id` column now holds a Deezer track id** — kept the column name; it's
  just the external unique id used for upsert de-duplication.
- **`songs` is server-seeded** — the anon key is read-only on it (RLS), so seeding runs
  in `api/songs.ts` with the service-role key. Needs `SUPABASE_SERVICE_ROLE_KEY`.
- **Catalog rotation = read-window, not deletes (Option D)** — Discover only reads songs
  first seen in the last 7 days (`DISCOVER_WINDOW_DAYS` in `src/lib/catalog.ts`). Rows are
  never deleted, so the leaderboard keeps full history; the swipe pool just rotates.
- **Deezer preview URLs expire (~15 min)** — signed `hdnea=exp` tokens. Don't trust the
  stored `preview_url`; the client resolves a fresh one at play time via `/api/preview`
  (JSONP fallback for plain `npm run dev`).
- **Mobile browsers repaint the cream palette brown — two separate mechanisms.**
  (1) iOS Safari in Dark Mode auto-darkens pages that don't declare a color scheme →
  fixed via `<meta name="color-scheme" content="light">` + `html { color-scheme: light }`.
  (2) Firefox for iOS's "Website Dark Mode" menu toggle injects the Dark Reader library,
  which *ignores* `color-scheme` → fixed via `<meta name="darkreader-lock">` (Dark Reader's
  supported opt-out; also disables the desktop Dark Reader extension on the site). Both
  metas live in `index.html`. If a dark tint reappears, check which mechanism before
  reaching for either fix.
- **Liked Songs is a denormalized localStorage snapshot** — each entry stores its own
  `{songId, spotifyId, title, artist, albumArtUrl, likedAt}` so the tab renders with zero network.
  It is *not* re-fetched from Supabase, so it won't reflect later edits to the song row;
  that's fine for an MVP. Read it back defensively (wrap `JSON.parse` in try/catch and
  drop malformed entries) — localStorage is user-writable and untrusted. Key:
  `majority:liked-songs`. Preview URLs are never stored (they expire); rows resolve a
  fresh one via `/api/preview` at play time, exactly like SongCard.
- **Stacked PRs can strand commits short of `main`** — when each PR's base is the
  previous PR's branch (not `main`), merging them top-down in the GitHub UI cascades each
  merge into its *intermediate base branch*, not into `main`. After "merging all," only
  the bottom PR (base `main`) actually reaches `main`; the rest land in the stack's
  branches and show MERGED while their code is absent from `main`. Verify with
  `git merge-base --is-ancestor <sha> origin/main` per commit, then reconcile by rebasing
  `main` over the full feature branch (shared commits dedupe). Happened with the Liked
  Songs stack (PRs #3–#8) on 2026-06-20. Prefer a single feature PR, or merge a stack
  strictly bottom-up retargeting each to `main` first.
- Duplicate voting prevention: SHA-256 of a per-browser id stored in `ip_hash` (MVP
  stand-in for real IP hashing — good enough for day 1, not abuse-proof)
- Deezer has an informal rate limit (~50 req / 5s); the seeder batches album fetches
- RLS row-level security: must explicitly enable policies on both tables. The
  leaderboard also needs a `votes` SELECT policy for anon (added beyond the brief).
- Realtime: enable replication on `votes` for instant leaderboard; else 8s polling fallback

## Deploy Target
- **Vercel** — auto-deploys on push to `main`. Project: `kevins-projects-dea10263/majority`
  (manual deploys also work: `vercel deploy --prod --scope kevins-projects-dea10263`).
- Env vars (set in Vercel project):
  - `VITE_SUPABASE_URL` (browser)
  - `VITE_SUPABASE_PUBLISHABLE_KEY` (browser)
  - `SUPABASE_URL` (server-only)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
  - `CRON_SECRET` (server-only; gates `/api/songs` and authenticates the daily cron)
  - (Deezer needs no key; the old `SPOTIFY_*` vars are gone.)
- Cron: `vercel.json` runs `/api/songs` daily at `0 8 * * *` (Hobby: ~once/day, may slip ~1h).

## Security Constraints
- `.env.local` is in `.gitignore` — never hardcode credentials
- Secrets are server-only (never `VITE_`-prefixed): `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
  The browser only holds the RLS-restricted anon key.
- `/api/songs` does privileged writes — requires `Authorization: Bearer $CRON_SECRET` in prod
- All user input validated before Supabase INSERT (vote ∈ {1,-1}, song_id present)
- Supabase RLS enforced: anon can read songs + insert votes (ip_hash required); nothing else
- No sensitive logic exposed to client

## Commit Conventions
Use Conventional Commits: `<type>(scope): <description>`
Types: feat, fix, refactor, chore, style, test, docs
Atomic commits — one concern per commit.
