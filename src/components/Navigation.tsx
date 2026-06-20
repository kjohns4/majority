import type { View } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Navigation — switch between Discover and Leaderboard
//
// WHAT: Two pill buttons that flip the active view.
//
// WHY:  Users need both halves of the experience: discovering songs (Discover)
//       and seeing how the crowd voted (Leaderboard).
//
// HOW:  We use simple lifted state instead of a router — there are only two
//       screens, so App owns the `view` value and passes it down with a setter.
//       No URL routing needed for the MVP. (React Router is a v2 nicety.)
// ─────────────────────────────────────────────────────────────────────────────

interface NavigationProps {
  view: View
  onChange: (view: View) => void
}

const TABS: { id: View; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'liked', label: 'Liked' },
]

export default function Navigation({ view, onChange }: NavigationProps) {
  return (
    <nav className="mx-auto mb-10 flex w-full max-w-sm gap-1 rounded-full bg-inset p-1">
      {TABS.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={
              'flex-1 rounded-full px-4 py-2 text-[15px] tracking-wide transition ' +
              (active
                ? 'bg-card text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink')
            }
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
