# Majority 🎧

**Music discovery by real people.** Swipe through 30-second previews of emerging
songs, vote 👍 / 👎, and watch a live leaderboard of what the crowd actually likes —
no algorithm deciding for you.

## Stack

- **Frontend:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Backend/DB/Auth:** Supabase (Postgres, anonymous voting, RLS)
- **Serverless:** Vercel Functions (`/api`)
- **Data:** Deezer public API (new releases + 30s previews, no auth)
- **Deploy:** Vercel

## How it fits together

```
Browser ──▶ /api/songs (Vercel Function)
              ├─ Deezer (new-release albums + 30s previews — public, no key)
              └─ Supabase upsert (service-role)   ← uses SUPABASE_SERVICE_ROLE_KEY
Browser ──▶ Supabase (anon key): read songs, insert votes, read leaderboard
```

The browser **never** sees the Supabase service-role key — it lives only inside
the serverless function (see "Security" below). The catalog source (Deezer) needs
no credentials at all.

> **Why not Spotify?** Spotify's Web API now requires the *app owner's* account to
> hold an active Premium subscription — every endpoint returns `403` without it.
> Deezer has no such gate and reliably serves previews, so it's the catalog source.

## Environment variables

Copy `.env.example` → `.env.local` and fill in the blanks. `.env.local` is
git-ignored.

| Variable | Where it runs | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Anon key (RLS-restricted, safe to expose) |
| `SUPABASE_URL` | Server (`/api`) | Supabase URL for the seeding function |
| `SUPABASE_SERVICE_ROLE_KEY` | Server (`/api`) | Writes to the read-only `songs` table |

> ⚠️ Anything prefixed `VITE_` is bundled into the client JS and is **public**.
> That's why the service-role key is *not* prefixed. (Deezer needs no key.)

## Supabase setup

Run the schema from [`CLAUDE.md`](./CLAUDE.md) in the Supabase SQL editor to create
the `songs` and `votes` tables, then enable RLS:

- `songs`: `SELECT` for anon (read-only)
- `votes`: `INSERT` for anon (with `ip_hash` present)

For the live leaderboard, enable **Realtime** on the `votes` table
(Database → Replication). If you skip this, the leaderboard still updates via an
8-second polling fallback.

## Local development

```bash
npm install

# UI only (no serverless functions). /api/songs is unavailable, so the app reads
# whatever songs are already in Supabase.
npm run dev

# Full stack incl. /api/songs (requires the Vercel CLI + env vars in .env.local):
vercel dev
```

Seed the catalog by hitting the function once it's running: open `/api/songs` in
the browser (or `curl localhost:3000/api/songs`). It pulls fresh new-release
tracks from Deezer and upserts them into Supabase.

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (zero-config — it detects Vite + `/api`).
2. Add the **four** env vars in the Vercel dashboard.
3. Push to `main` → auto-deploy.

## Security

- The Supabase service-role key runs **only** in `/api/songs` and is never
  prefixed `VITE_`, so Vite never bundles it into the browser.
- The browser uses the Supabase anon (publishable) key, locked down by RLS:
  read songs, insert votes — nothing destructive.
- Vote inputs are validated client-side (`song_id` present, vote ∈ {1, -1}) and
  again by the FK + RLS policy server-side.

## Known gotchas

- **Spotify is paywalled for API use.** Spotify's Web API now requires the app
  owner to hold Premium (every endpoint `403`s otherwise), so the catalog is
  sourced from Deezer instead. Deezer needs no auth and reliably returns previews.
- **`spotify_id` column is now a Deezer id.** The DB column kept its name; it
  holds the external Deezer track id (used for de-duplication on upsert).
- **Deezer matching is by feed, not search.** Songs come from Deezer's
  new-releases editorial feed (topped up from charts), so they're real and fresh,
  but "emerging" is Deezer's definition, not a hand-curated indie feed.
- **Discover shows the last 7 days only (rotation).** Songs are never deleted —
  the table keeps full history so the leaderboard stays intact — but the Discover
  feed only reads songs first seen in the last `DISCOVER_WINDOW_DAYS` (7) days, so
  the swipe pool rotates as new releases come in. Change the window in
  `src/lib/catalog.ts`.
- **Anonymous voting is "good enough," not abuse-proof.** Duplicate prevention
  uses a SHA-256 of a per-browser id (stand-in for the `ip_hash` column). Clearing
  storage or switching browsers lets you vote again. Real prevention (server-side
  IP hashing or auth) is a v2 item.
- **`songs` is server-seeded.** The anon key can't write to it; seeding needs the
  service-role key via `/api/songs`.

## Project structure

```
api/
  songs.ts            # Serverless: Deezer new releases -> Supabase upsert
src/
  components/         # SongCard, Leaderboard, Navigation
  pages/              # CardView (discover), LeaderboardView
  lib/                # supabase, catalog, voting
  types/              # shared types + row mappers
```
