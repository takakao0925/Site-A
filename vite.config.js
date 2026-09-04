import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The existing static site (index.html / main.js / styles.css at the
// project root) is untouched and keeps working exactly as before, opened
// directly or served by any plain static server. This Vite+React setup is
// a separate playground rooted at react-app/, with its own entry HTML, so
// the two never collide — `npm run dev` only ever serves react-app/.
export default defineConfig({
  root: 'react-app',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
