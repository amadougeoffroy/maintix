import { defineConfig } from 'vitest/config'

// Contre un vrai Postgres partagé (TEST_DATABASE_URL), les fichiers de test s'exécutent l'un après l'autre.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 20000, fileParallelism: !process.env.TEST_DATABASE_URL },
})
