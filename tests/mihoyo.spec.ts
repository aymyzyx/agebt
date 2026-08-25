import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync } from 'fs';

/* =========================================================
   原神官网冒烟测试（无需登录）
   - 目标：验证 GitHub Actions 流水线能跑通：打开页面 → 等渲染 → 前后截图
   - 无账号密码，每个用例直接 goto，互不依赖
   - 截图策略沿用之前的要求：每用例 before/after 成对、截前等几秒、区域截图避免雷同
   ========================================================= */

const SITE = 'https://ys.mihoyo.com';
const PATH = '/?utm_source=yuanshen_web';
const SHOT = 'screenshots';
mkdirSync(SHOT, { recursive: true });

/* ---------- 截图助手 ---------- */
async function shot(page: Page, name: string, target?: Locator) {
  await page.waitForTimeout(1_500); // 截前再等几秒，确保动态内容渲染完
  const path = `${SHOT}/${name}.png`;
  if (target) {
    await target.screenshot({ path }).catch(async () => {
      await page.screenshot({ path, fullPage: true });
    });
  } else {
    await page.screenshot({ path, fullPage: true });
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 });
});

/* ============ mh_01 首页加载 ============ */
test('mh_01 首页加载-标题与渲染(前后对比)', async ({ page }) => {
  await shot(page, 'mh_01_before_顶部');
  await expect(page).toHaveTitle(/原神/);
  await page.waitForTimeout(2_000); // 等轮播/动态资源
  await shot(page, 'mh_01_after_渲染', page.locator('body'));
});

/* ============ mh_02 页脚信息 ============ */
test('mh_02 页脚信息-关键链接可见(前后对比)', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'mh_02_before_页脚');
  const agree = page.getByRole('link', { name: '用户协议' }).first();
  const privacy = page.getByRole('link', { name: '隐私政策' }).first();
  const about = page.getByRole('link', { name: '关于我们' }).first();
  await expect(agree).toBeVisible();
  await expect(privacy).toBeVisible();
  await expect(about).toBeVisible();
  await shot(page, 'mh_02_after_页脚');
});

/* ============ mh_03 外链可达 ============ */
test('mh_03 外链可达-关于我们指向 mihoyo', async ({ page }) => {
  const about = page.getByRole('link', { name: '关于我们' }).first();
  await expect(about).toBeVisible();
  const href = (await about.getAttribute('href')) || '';
  expect(href).toMatch(/mihoyo\.com/);
  await shot(page, 'mh_03_关于我们链接');
});

/* ============ mh_04 移动端响应式 ============ */
test('mh_04 移动端视口-响应式渲染(前后对比)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'mh_04_before_移动端');
  await page.waitForTimeout(1_500);
  await shot(page, 'mh_04_after_移动端');
});

/*
  ▶ 截图输出：workspace/screenshots/mh_*.png（每用例 before + after 成对）
  ▶ 无需登录，无需 CRM 服务器；用于验证 GitHub Actions 流水线是否跑通
  ▶ CRM 用例已临时停用（crm-dashboard.spec.ts.disabled），服务器恢复后可改回 .spec.ts 复用
*/
