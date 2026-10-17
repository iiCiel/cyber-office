import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/, so every path gets that prefix
// (dev server and preview too: open http://localhost:5173/cyber-office/).
export default defineConfig({
  base: '/cyber-office/',
  build: {
    chunkSizeWarningLimit: 2000, // Phaser itself is ~1.2 MB
  },
});
