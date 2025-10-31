import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    hookTimeout: 60000,
    testTimeout: 30000,
    coverage: {
      // Use istanbul for more stable source maps in package-only run
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['json', 'text', 'json-summary']
    }
  }
});
