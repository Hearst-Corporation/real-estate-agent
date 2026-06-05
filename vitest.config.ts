import { defineConfig } from 'vitest/config';

// Tests unitaires (logique pure). Les specs Playwright (e2e/, electron/) restent
// gérées par `npm run test:e2e` et ne sont jamais ramassées ici.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules/**', 'e2e/**', 'electron/**', 'dist-electron/**', '.next/**'],
  },
});
