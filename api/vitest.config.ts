import { defineConfig } from 'vitest/config';

// Unit tests: no database. Integration tests live in test/integracion and run
// with vitest.integracion.config.ts against the docker compose databases.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['test/integracion/**', 'node_modules/**'],
    environment: 'node',
  },
});
