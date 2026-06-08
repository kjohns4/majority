# Majority — Music Discovery by Real People

Majority is a music discovery app where real humans vote on emerging songs. 
Instead of algorithms deciding what's popular, the community votes. Users swipe 
through 30-second previews of new songs from Spotify's emerging artist feeds, 
vote 👍 or 👎, and watch a live leaderboard of what the crowd actually likes.

## Stack
- **Frontend:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS v4
- **Backend/Database/Auth:** Supabase (Postgres, anonymous voting)
- **Deployment:** Vercel
- **Data:** Spotify Web API (previews + metadata)

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
- None yet

## Current Task
Build MVP: fetch emerging songs from Spotify, display swipeable cards with 30-sec previews, 
store votes, show real-time leaderboard.

### Acceptance Criteria
- [ ] Fetch ~50 songs from Spotify's new releases or emerging artists feed
- [ ] Display one song card at a time: album art, title, artist, play button (30-sec preview)
- [ ] Vote buttons (👍 upvote, 👎 downvote) store vote in Supabase
- [ ] Leaderboard view shows top 10 songs sorted by vote count (realtime)
- [ ] Navigation between card view and leaderboard
- [ ] Deployed to Vercel, live URL working

## V2 Backlog
- User profiles / authentication (Supabase Auth via magic link)
- Follow tastemakers (curators with good voting history)
- Genre / mood filters
- Artist dashboard (see how many votes your song got)
- Weekly "most voted" email digest
- Real-time vote sync (WebSocket or polling)

## Known Gotchas
- Spotify preview URLs: ~5-10% of songs may not have previews (handle gracefully)
- Duplicate voting prevention: IP hashing for MVP (not perfect, but good enough for day 1)
- Spotify rate limits: generous for free tier (~400k req/month) — no issue for MVP
- RLS row-level security: must explicitly enable policies on both tables

## Deploy Target
- **Vercel** (auto-deploy on push to main)
- Env vars needed in Vercel dashboard:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SPOTIFY_CLIENT_ID`

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
