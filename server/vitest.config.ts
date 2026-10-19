import { defineConfig } from 'vitest/config'

// Contre un vrai Postgres partagé (TEST_DATABASE_URL), les fichiers de test s'exécutent l'un après l'autre.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 30000, hookTimeout: 60000, // contre un Postgres froid, recréer le schéma peut dépasser les 10 s par défaut
     fileParallelism: !process.env.TEST_DATABASE_URL },
})
