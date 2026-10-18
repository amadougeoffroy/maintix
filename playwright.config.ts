import { defineConfig, devices } from '@playwright/test'

// Trois moteurs : Chromium (Android), WebKit (iPhone / Safari) et Firefox. `--project=chromium` pour un seul.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 14'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 412, height: 839 } } },
  ],
  webServer: { command: 'npm run dev -- --port 5199', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 60000 },
})
