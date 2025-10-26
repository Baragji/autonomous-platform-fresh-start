import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    hookTimeout: 60000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['json', 'text', 'json-summary']
    }
  }
});
