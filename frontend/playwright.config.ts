import { defineConfig } from '@playwright/test'

const baseURL = process.env.HUMANFLOW_PREVIEW_URL || 'http://127.0.0.1:5174'
const apiPort = process.env.HUMANFLOW_API_PORT || '8000'
const apiURL = `http://127.0.0.1:${apiPort}`
const frontendPort = new URL(baseURL).port || '5174'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
  },
  webServer: process.env.CI ? [
    {
      command: `python -m uvicorn backend.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: '..', url: `${apiURL}/health`, reuseExistingServer: false, timeout: 60000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: baseURL, env: { API_PROXY_TARGET: apiURL }, reuseExistingServer: false, timeout: 60000,
    },
  ] : undefined,
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
