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
      // sw.js queda fuera porque corre en el contexto del service worker, que
      // jsdom no replica; medirlo siempre da 0% y no aporta señal.
      // main.js sí se mide: los tests de integración lo importan de verdad.
      exclude: ['sw.js', 'vitest.config.js'],
      reporter: ['text', 'html'],
    },
  },
});
