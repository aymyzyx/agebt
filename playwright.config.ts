import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'https://ys.mihoyo.com',
    // 本地有显示器 → false（弹出真实浏览器看界面）；CI 环境(无显示器)自动 true
    headless: !!process.env.CI,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    // 截图我们在用例里手动控制 before/after，这里不自动截
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
