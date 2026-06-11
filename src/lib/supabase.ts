import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client (frontend / anonymous)
//
// WHAT: A single shared connection to our Supabase project, created with the
//       *publishable* (anon) key. Every read of songs/votes and every vote
//       INSERT from the browser goes through this client.
//
// WHY:  Centralizing the connection means components never re-create clients or
//       duplicate config. If we ever swap databases, this is the only file that
//       changes. Using the anon key (not the service role key) keeps the browser
//       locked down to exactly what Row Level Security allows: read songs, insert
//       votes — nothing destructive.
//
// HOW:  Vite exposes only `VITE_`-prefixed env vars to the browser. We read the
//       URL + publishable key from those, fail loudly if they're missing (a
//       misconfigured deploy should be obvious, not silently broken), and hand
//       them to `createClient`.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (and in the Vercel dashboard).',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
