import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['*.js'],
      exclude: ['main.js', 'sw.js'],
      reporter: ['text', 'html'],
    },
  },
});
