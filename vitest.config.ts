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
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['json', 'text', 'json-summary']
    }
  }
});
