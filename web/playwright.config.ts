// End-to-end run of the 4 MVP flows in a real browser (F5 evidence, F7 base).
// Uses the system Chrome (no browser download) and the local stack: it starts
// the API and the web dev server when they are not already running.
// Precondition: the databases are up with the demo seed (docker compose up -d postgres mongo).
// E2E_BASE_URL runs the same flows against an already running stack instead,
// for example the compose web container (F6): E2E_BASE_URL=http://localhost:8080
import { defineConfig } from '@playwright/test';

const baseExterna = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: baseExterna ?? 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    viewport: { width: 1280, height: 900 },
  },
  webServer: baseExterna ? [] : [
    { command: 'npm run dev -w api', cwd: '..', url: 'http://localhost:3000/api/v1/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
});
