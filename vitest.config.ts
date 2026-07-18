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
    // Environnement par défaut : Node (logique pure). Les tests de composant
    // déclarent `// @vitest-environment jsdom` en tête de fichier — Vitest bascule
    // alors ce fichier seul en jsdom, sans ralentir les ~1100 tests Node.
    environment: 'node',
    setupFiles: ['test/setup/react-testing.ts'],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
      'components/**/*.test.tsx',
    ],
    exclude: ['node_modules/**', 'e2e/**', 'electron/**', 'dist-electron/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
