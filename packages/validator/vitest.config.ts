import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
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
