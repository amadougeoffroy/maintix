import { defineConfig, devices } from '@playwright/test'

// E2E « mode serveur » : vraie API (Postgres embarqué), front Vite proxifié, e-mails écrits dans un fichier.
export default defineConfig({
  testDir: 'e2e-server',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  timeout: 60000,
  use: { baseURL: 'http://localhost:5198', ...devices['Pixel 7'] },
  webServer: [
    {
      command: 'rm -f /tmp/cabine-e2e-mail.jsonl && cd server && npx tsx src/index.ts',
      url: 'http://localhost:8788/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: { PORT: '8788', APP_URL: 'http://localhost:5198', BOOTSTRAP_TOKEN: 'e2e-secret', MAIL_OUTBOX_FILE: '/tmp/cabine-e2e-mail.jsonl' },
    },
    {
      command: 'npx vite --port 5198 --strictPort',
      url: 'http://localhost:5198',
      reuseExistingServer: false,
      timeout: 60000,
      env: { API_TARGET: 'http://localhost:8788' },
    },
  ],
})
