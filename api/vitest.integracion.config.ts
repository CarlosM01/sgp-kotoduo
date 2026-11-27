import { defineConfig } from 'vitest/config';

// Integration tests against the real PostgreSQL and MongoDB of docker compose.
// Files run one after another because they share the same databases.
export default defineConfig({
  test: {
    include: ['test/integracion/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/integracion/entorno.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
