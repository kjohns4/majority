# Majority 🎧

**Music discovery by real people.** Swipe through 30-second previews of emerging
songs, vote 👍 / 👎, and watch a live leaderboard of what the crowd actually likes —
no algorithm deciding for you.

## Stack

- **Frontend:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Backend/DB/Auth:** Supabase (Postgres, anonymous voting, RLS)
- **Serverless:** Vercel Functions (`/api`)
- **Data:** Spotify Web API (metadata) + Deezer (preview fallback)
- **Deploy:** Vercel

## How it fits together

```
Browser ──▶ /api/songs (Vercel Function)
              ├─ Spotify (client-credentials, server-side)  ← uses SPOTIFY_CLIENT_SECRET
              ├─ Deezer (backfills missing 30s previews)
              └─ Supabase upsert (service-role)             ← uses SUPABASE_SERVICE_ROLE_KEY
Browser ──▶ Supabase (anon key): read songs, insert votes, read leaderboard
```

The browser **never** sees the Spotify secret or the Supabase service-role key —
both live only inside the serverless function (see "Security" below).

## Environment variables

Copy `.env.example` → `.env.local` and fill in the blanks. `.env.local` is
git-ignored.

| Variable | Where it runs | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Anon key (RLS-restricted, safe to expose) |
| `SPOTIFY_CLIENT_ID` | Server (`/api`) | Spotify app id |
| `SPOTIFY_CLIENT_SECRET` | Server (`/api`) | Spotify secret — **never** prefixed `VITE_` |
| `SUPABASE_URL` | Server (`/api`) | Supabase URL for the seeding function |
| `SUPABASE_SERVICE_ROLE_KEY` | Server (`/api`) | Writes to the read-only `songs` table |

> ⚠️ Anything prefixed `VITE_` is bundled into the client JS and is **public**.
> That's why the Spotify secret and the service-role key are *not* prefixed.

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
the browser (or `curl localhost:3000/api/songs`). It fetches from Spotify,
backfills previews from Deezer, and upserts into Supabase.

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (zero-config — it detects Vite + `/api`).
2. Add **all six** env vars in the Vercel dashboard.
3. Push to `main` → auto-deploy.

## Security

- Spotify Client Secret and the Supabase service-role key run **only** in
  `/api/songs` and are never prefixed `VITE_`, so Vite never bundles them into the
  browser.
- The browser uses the Supabase anon (publishable) key, locked down by RLS:
  read songs, insert votes — nothing destructive.
- Vote inputs are validated client-side (`song_id` present, vote ∈ {1, -1}) and
  again by the FK + RLS policy server-side.

## Known gotchas

- **Spotify previews are mostly `null` now.** Since late 2024 Spotify stopped
  returning `preview_url` for most tracks. The serverless function backfills from
  Deezer's public API so the core "play a 30s clip" loop still works; tracks with
  no preview anywhere are still votable, just not playable.
- **Anonymous voting is "good enough," not abuse-proof.** Duplicate prevention
  uses a SHA-256 of a per-browser id (stand-in for the `ip_hash` column). Clearing
  storage or switching browsers lets you vote again. Real prevention (server-side
  IP hashing or auth) is a v2 item.
- **`songs` is server-seeded.** The anon key can't write to it; seeding needs the
  service-role key via `/api/songs`.

## Project structure

```
api/
  songs.ts            # Serverless: Spotify -> Deezer -> Supabase upsert
src/
  components/         # SongCard, Leaderboard, Navigation
  pages/              # CardView (discover), LeaderboardView
  lib/                # supabase, spotify, voting
  types/              # shared types + row mappers
```
