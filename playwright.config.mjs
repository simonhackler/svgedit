import { defineConfig } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH
const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const port = process.env.PLAYWRIGHT_PORT || '8000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${host}:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL,
    headless: true,
    launchOptions: executablePath
      ? { executablePath }
      : undefined
  },
  reporter: 'list',
  webServer: {
    command: `npm run start:e2e -- --host ${host} --port ${port} --strictPort`,
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000
  }
})
