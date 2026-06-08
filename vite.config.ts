import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 is wired in as a Vite plugin (no separate tailwind.config.js or
// PostCSS step needed in v4 — the plugin handles scanning + generation).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
