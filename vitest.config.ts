import path from 'path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@autonomous/vfs': path.resolve(__dirname, 'packages/vfs/src'),
      '@autonomous/vfs/': `${path.resolve(__dirname, 'packages/vfs/src')}/`
    }
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    setupFiles: ['dotenv/config'],
    hookTimeout: 120000,
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['json', 'text', 'json-summary']
    }
  }
});
