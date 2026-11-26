/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only talks to its own origin: the dev server and the preview
// forward /api to the API, so the API keeps its restricted CORS (F2).
const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const proxy = { '/api': { target: API, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Pure domain rules shared with the API (permission map, new order schema).
    alias: { '@dominio': fileURLToPath(new URL('../api/src/dominio', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/preparar.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
