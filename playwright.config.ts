import { defineConfig, devices } from '@playwright/test'

// Editor end-to-end tests: the real editor, served by `stroc serve contracts --editor`, driven in
// Chromium, WebKit (Safari's engine) and Firefox with real keyboard and mouse input. Each test gets
// a fresh browser context. Run with `yarn test:e2e`.
const PORT = 3990

export default defineConfig({
  testDir: './test/e2e',
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    testIdAttribute: 'data-test',   // tests find controls by stable ids, not by styling or wording
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `yarn build && node packages/cli/dist/src/index.js serve contracts --editor --port ${PORT}`,
    url: `http://localhost:${PORT}/editor/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
