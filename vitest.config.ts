import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests unitaires (logique pure). Les specs Playwright (e2e/, electron/) restent
// gérées par `npm run test:e2e` et ne sont jamais ramassées ici.
export default defineConfig({
  resolve: {
    alias: {
      // `server-only` jette hors d'un Server Component React.
      // En test Node, on le neutralise avec un stub vide.
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
      // Idem pour `client-only` si jamais utilisé dans des modules testés.
      'client-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
      // Alias Next.js `@/` → racine du projet.
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules/**', 'e2e/**', 'electron/**', 'dist-electron/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
