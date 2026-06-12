# Majority — Music Discovery by Real People

Majority is a music discovery app where real humans vote on emerging songs. 
Instead of algorithms deciding what's popular, the community votes. Users swipe 
through 30-second previews of new-release songs (sourced from Deezer's public 
feed), vote 👍 or 👎, and watch a live leaderboard of what the crowd actually likes.

## Stack
- **Frontend:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS v4
- **Backend/Database/Auth:** Supabase (Postgres, anonymous voting)
- **Deployment:** Vercel
- **Data:** Deezer public API (new releases + 30s previews, no auth). NOTE: pivoted
  off Spotify — its Web API now requires the app owner to have Premium (403s otherwise).

## Folder Structure
src/
components/
SongCard.tsx        # Display song + preview player + vote buttons
Leaderboard.tsx     # Top 10 songs sorted by vote count
Navigation.tsx      # Toggle between card view and leaderboard
pages/
CardView.tsx
LeaderboardView.tsx
lib/
supabase.ts         # Supabase client init
spotify.ts          # Spotify API calls
types/
index.ts
App.tsx
main.tsx
.env.local              # Supabase URL, key, Spotify Client ID

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

## Completed Tasks
- Scaffold: Vite + React + TS, Tailwind v4, Supabase client
- Task 1: Supabase client (`src/lib/supabase.ts`)
- Task 2: Catalog integration — Deezer (`api/songs.ts` + `src/lib/catalog.ts`)
- Task 3: Song card UI (`src/components/SongCard.tsx`)
- Task 4: Vote storage (`src/lib/voting.ts`)
- Task 5: Leaderboard (`src/components/Leaderboard.tsx`)
- Task 6: Navigation + pages + App wiring
- Task 7: Styling polish

## Current Task
Build MVP: fetch emerging songs from Spotify, display swipeable cards with 30-sec previews, 
store votes, show real-time leaderboard.

### Acceptance Criteria
- [x] Fetch ~50 songs from a new-releases feed (Deezer, server-side via `/api/songs`)
- [x] Display one song card at a time: album art, title, artist, play button (30-sec preview)
- [x] Vote buttons (👍 upvote, 👎 downvote) store vote in Supabase
- [x] Leaderboard view shows top 10 songs sorted by vote count (realtime + polling fallback)
- [x] Navigation between card view and leaderboard
- [x] Deployed to Vercel, live URL working — **https://majority-eight.vercel.app**

### Status (2026-06-11)
- **Live on Vercel** at https://majority-eight.vercel.app (auto-deploys on push to `main`);
  all 4 env vars set in Production (`/api/songs` returns 200 with 50 rows, so the
  service-role key + Supabase URL are wired up correctly).
- Supabase tables created (with an added `votes` SELECT policy for the leaderboard).
- Catalog seeded — **50 songs, all with previews**.
- Verified end-to-end (local `vercel dev` + production): `/api/preview` 200, `/api/songs`
  200/50 songs, anon read of songs + anon vote INSERT both work.
- **Fixed (2026-06-11):** `/api/songs` and `/api/preview` were timing out / 500ing —
  see the "API handlers must use Node `(req, res)` signature" gotcha below.
- (Optional) enable Realtime on `votes` for instant leaderboard (else 8s polling fallback).

## V2 Backlog
- User profiles / authentication (Supabase Auth via magic link)
- Follow tastemakers (curators with good voting history)
- Genre / mood filters
- Artist dashboard (see how many votes your song got)
- Weekly "most voted" email digest
- Real-time vote sync (WebSocket or polling)

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
- Duplicate voting prevention: SHA-256 of a per-browser id stored in `ip_hash` (MVP
  stand-in for real IP hashing — good enough for day 1, not abuse-proof)
- Deezer has an informal rate limit (~50 req / 5s); the seeder batches album fetches
- RLS row-level security: must explicitly enable policies on both tables. The
  leaderboard also needs a `votes` SELECT policy for anon (added beyond the brief).
- Realtime: enable replication on `votes` for instant leaderboard; else 8s polling fallback

## Deploy Target
- **Vercel** (auto-deploy on push to main)
- Env vars needed in Vercel dashboard:
  - `VITE_SUPABASE_URL` (browser)
  - `VITE_SUPABASE_PUBLISHABLE_KEY` (browser)
  - `SUPABASE_URL` (server-only)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
  - (Deezer needs no key; the old `SPOTIFY_*` vars are unused now.)

## Security Constraints
- `.env.local` is in `.gitignore` — never hardcode credentials
- Spotify Client Secret: store in .env.local only, never in frontend code (it's sensitive)
- All user input validated before Supabase INSERT
- Supabase RLS enforced: anonymous voting is restricted by ip_hash policy
- No sensitive logic exposed to client

## Commit Conventions
Use Conventional Commits: `<type>(scope): <description>`
Types: feat, fix, refactor, chore, style, test, docs
Atomic commits — one concern per commit.
