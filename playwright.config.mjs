import { defineConfig } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000',
    headless: true,
    launchOptions: executablePath
      ? { executablePath }
      : undefined
  },
  reporter: 'list',
  webServer: {
    command: 'npm run start:e2e',
    url: 'http://localhost:8000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000
  }
})
