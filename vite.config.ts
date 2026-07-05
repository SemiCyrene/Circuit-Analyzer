// Trigger fresh build run
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// NOTE: Set `base` to your GitHub repository name when deploying to GitHub Pages.
// e.g. if your repo is github.com/yourname/circuit-analyzer, set base: '/circuit-analyzer/'
// For a custom domain or user/org page (yourname.github.io), use base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/Circuit-Analyzer/',   // ← Match your GitHub repo name 'Circuit Analyzer'
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
