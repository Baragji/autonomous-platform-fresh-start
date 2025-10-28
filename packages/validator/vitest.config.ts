import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include both integration specs and unit tests colocated under src
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    hookTimeout: 60000,
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['json', 'text', 'json-summary']
    }
  }
});
