import { test as base, expect, type Page, type BrowserContext, type Locator } from '@playwright/test';
import { mkdirSync } from 'fs';

const USER = process.env.CRM_USER || 'admin';
const PASS = process.env.CRM_PASS || '';
const SHOT = 'screenshots';
mkdirSync(SHOT, { recursive: true });

/* =========================================================
   ① 登录只做一次：用“共享 page”覆盖 page fixture。
   整个文件共用一个 context/page，第一次创建时登录，
   之后所有用例复用，不再每条重登。
   ========================================================= */
let _ctx: BrowserContext | undefined;
let _page: Page | undefined;

const test = base.extend<{ page: Page }>({
  page: async ({ browser }, use) => {
    if (!_page) {
      _ctx = await browser.newContext();
      _page = await _ctx.newPage();
      await login(_page);
    }
    await use(_page);
  },
});

/* ---------- 登录（已登录则直接跳过，避免重复填表）---------- */
async function login(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  // 已在驾驶舱内 → 说明登录态有效，直接返回
  const onApp = await page.getByText(/总览|趋势图|热力图|销售业绩/).first().isVisible().catch(() => false);
  if (onApp) return;

  // 常见用户名输入框兜底：label / placeholder / id / name / class
  const userInput = page
    .locator(`input[placeholder*="用户名" i], input[placeholder*="账号" i], input[name="username" i], input[id="username" i], input[type="text"]:visible, input.login-input:visible`)
    .first();
  await userInput.or(page.getByLabel(/用户名|账号/i)).fill(USER);

  const passInput = page
    .locator(`input[placeholder*="密码" i], input[name="password" i], input[id="password" i], input[type="password"]:visible`)
    .first();
  await passInput.or(page.getByLabel(/密码/i)).fill(PASS);

  await page.getByRole('button', { name: /登录|登 录|Login|submit/i }).or(page.locator('button[type="submit"]:visible')).click();
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
}

/* ---------- 进驾驶舱 ---------- */
async function openDashboard(page: Page) {
  const onApp = await page.getByText(/总览|趋势图|热力图|销售业绩/).first().isVisible().catch(() => false);
  if (onApp) return;
  const menu = page
    .locator(`[role="menuitem"], .ant-menu-item, .el-menu-item, .sidebar a, .nav-item, header a`)
    .filter({ hasText: /驾驶舱|大屏|工作台|首页|dashboard/i })
    .first();
  await menu.click({ timeout: 10_000 }).catch(() => {});
  await page.getByText(/总览|趋势图|热力图|销售业绩/).first().waitFor({ timeout: 15_000 }).catch(() => {});
}

/* ---------- ② 加载不全就点右上角刷新 ---------- */
async function clickRefresh(page: Page): Promise<boolean> {
  const candidates = [
    page.locator('header [aria-label="刷新"], .header [aria-label="刷新"]'),
    page.locator('header button[title*="刷新" i], .header button[title*="刷新" i]'),
    page.locator('button:has(svg[class*="refresh" i]), button[class*="refresh" i]'),
    page.getByRole('button', { name: /刷新/ }),
  ];
  for (const c of candidates) {
    if (await c.count().then((n) => n > 0)) {
      await c.first().click({ timeout: 4000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/* 等驾驶舱关键区域出现；等不到就点刷新再等一轮 */
async function ensureLoaded(page: Page, timeout = 20_000) {
  const key = page.getByText(/总览|趋势图|热力图|销售业绩/).first();
  let loaded = false;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await key.isVisible().catch(() => false)) { loaded = true; break; }
    await page.waitForTimeout(1500);
  }
  if (!loaded) {
    await clickRefresh(page); // ③ 右上角刷新重试
    const s2 = Date.now();
    while (Date.now() - s2 < 15_000) {
      if (await key.isVisible().catch(() => false)) { loaded = true; break; }
      await page.waitForTimeout(1500);
    }
  }
  // ③ 等几秒，确保图表真正渲染完再允许截屏
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(2_500);
}

/* ---------- 截图助手（④ 每个用例都有 before/after）----------
   命名带 用例号_状态_细节 → 不重名、一眼区分；
   优先对具体操作区域截图 → 不同用例截不同区域，不会“都一样”；
   截前先等 networkidle + 1.5s，绝不在加载中截屏。        */
function region(page: Page, label: string): Locator {
  return page.locator(`xpath=//section[.//*[contains(normalize-space(.), "${label}")]]`).first();
}
async function shot(page: Page, name: string, target?: Locator) {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500); // ③ 截前再等几秒
  const path = `${SHOT}/${name}.png`;
  if (target) {
    await target.screenshot({ path }).catch(async () => {
      await page.screenshot({ path, fullPage: true }); // 区域截失败兜底整页
    });
  } else {
    await page.screenshot({ path, fullPage: true });
  }
}

/* ---------- 每个用例前：回到驾驶舱并等加载完（不重登）---------- */
test.beforeEach(async ({ page }) => {
  await login(page);          // 已登录则秒过
  await openDashboard(page);
  await ensureLoaded(page);   // ⑦ 等加载完再进用例
});

/* ============ 页面框架 ============ */

test('case_01 页面框架-加载渲染', async ({ page }) => {
  await shot(page, 'case_01_before_进入', region(page, '总览卡片'));
  await clickRefresh(page);                 // 触发一次刷新，验证重载
  await ensureLoaded(page);
  await shot(page, 'case_01_after_刷新', region(page, '总览卡片'));
  await expect(page.getByText('总览')).toBeVisible();
  await expect(page.getByText('趋势图')).toBeVisible();
  await expect(page.getByText('热力图')).toBeVisible();
});

/* ============ 顶部筛选 ============ */

test('case_06 顶部时间筛选-快捷切换(前后对比)', async ({ page }) => {
  const overview = region(page, '总览卡片');
  await shot(page, 'case_06_before_累计', overview);
  for (const t of ['今日', '本周', '本月', '本季度', '本年']) {
    await page.getByRole('button', { name: t }).click();
    await shot(page, `case_06_after_${t}`, overview);
  }
  const cur = await page.getByText(/总保费/).locator('xpath=..').innerText();
  expect(cur).toMatch(/元/);
});

test('case_07 自定义日期-精准定位修复 strict violation', async ({ page }) => {
  await shot(page, 'case_07_before_有俩日期框');
  const topStart = page.getByRole('banner').getByPlaceholder('开始日期');
  await expect(topStart).toHaveCount(1);
  await topStart.fill('2026-08-01');
  await page.getByRole('banner').getByPlaceholder('结束日期').fill('2026-08-18');
  await page.getByRole('button', { name: /确定|查询/ }).click();
  await shot(page, 'case_07_after_自定义区间', region(page, '总览卡片'));
});

test('case_09 市场选择器-多选过滤', async ({ page }) => {
  const picker = region(page, '选择市场');
  await shot(page, 'case_09_before_收起', picker);
  await page.getByRole('button', { name: /选择市场/ }).click();
  await shot(page, 'case_09_mid_展开', picker);
  await page.getByRole('option').first().click();
  await shot(page, 'case_09_after_选中', region(page, '总览卡片'));
});

test('case_11 刷新按钮-前后对比', async ({ page }) => {
  const overview = region(page, '总览卡片');
  await shot(page, 'case_11_before_刷新', overview);
  await clickRefresh(page);
  await ensureLoaded(page);
  await shot(page, 'case_11_after_刷新', overview);
});

test('case_12 总在保金额-不受时间筛选影响', async ({ page }) => {
  const overview = region(page, '总览卡片');
  await shot(page, 'case_12_before_累计', overview);
  const read = async () => (await page.getByText(/总在保金额/).locator('xpath=..').innerText()).trim();
  const a = await read();
  await page.getByRole('button', { name: '今日' }).click();
  const b = await read();
  await page.getByRole('button', { name: '累计' }).click();
  const c = await read();
  expect(a).toBe(c);
  await shot(page, 'case_12_after_切回累计', overview);
});

/* ============ 总览卡片 / 销售业绩 ============ */

test('case_13 总览卡片-总保费随筛选变化', async ({ page }) => {
  const card = region(page, '总保费');
  await shot(page, 'case_13_before_累计', card);
  const val = async () => (await card.innerText()).replace(/[^\d.]/g, '');
  const acc = await val();
  await page.getByRole('button', { name: '本年' }).click();
  const ytd = await val();
  expect(Number(acc)).toBeGreaterThanOrEqual(Number(ytd));
  await shot(page, 'case_13_after_本年', card);
});

test('case_28 销售业绩-排序切换(前后对比)', async ({ page }) => {
  const list = region(page, '销售业绩排行');
  await shot(page, 'case_28_before_保费', list);
  await list.getByRole('button', { name: /笔数/ }).click();
  await shot(page, 'case_28_after_笔数', list);
  await list.getByRole('button', { name: /客户数/ }).click();
  await shot(page, 'case_28_after_客户数', list);
});

test('case_34 销售业绩-分页(第1/2页对比)', async ({ page }) => {
  const list = region(page, '销售业绩排行');
  await shot(page, 'case_34_before_第1页', list);
  await page.getByRole('button', { name: /下一页|2/ }).click();
  await shot(page, 'case_34_after_第2页', list);
});

/* ============ 趋势图 / 热力图 ============ */

test('case_41 趋势图-维度切换(前后对比)', async ({ page }) => {
  const chart = region(page, '趋势图');
  await shot(page, 'case_41_before_自然月', chart);
  await chart.getByRole('button', { name: /自然年/ }).click();
  await shot(page, 'case_41_after_自然年', chart);
  await chart.getByRole('button', { name: /选择市场/ }).click();
  await shot(page, 'case_41_after_选择市场', chart);
});

test('case_45 热力图-地图渲染', async ({ page }) => {
  const map = region(page, '热力图');
  await shot(page, 'case_45_before_地图', map);
  await expect(page.getByText(/高|较高|中|低|未开展/).first()).toBeVisible();
  await shot(page, 'case_45_after_渲染', map);
});

test('case_46 热力图-指标切换(前后对比)', async ({ page }) => {
  const map = region(page, '热力图');
  await shot(page, 'case_46_before_保费', map);
  await map.getByRole('button', { name: /时间/ }).click();
  await shot(page, 'case_46_after_时间', map);
  await map.getByRole('button', { name: /全部/ }).click();
  await shot(page, 'case_46_after_全部', map);
});

/* ============ 市场综合统计 / 异常 ============ */

test('case_58 市场综合统计-导出Excel', async ({ page }) => {
  const table = region(page, '市场综合统计');
  await shot(page, 'case_58_before_导出', table);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出/ }).click();
  await dl;
  await shot(page, 'case_58_after_导出', table);
});

test('case_61 异常-无数据友好提示', async ({ page }) => {
  const rank = region(page, '销售业绩排行');
  await shot(page, 'case_61_before_累计', rank);
  await page.getByRole('button', { name: '今日' }).click();
  await shot(page, 'case_61_after_今日_无数据', rank);
  await expect(page.getByText(/暂无|暂无排行数据|--/).first()).toBeVisible();
});

test('case_64 数据口径-跨区域一致性抽查', async ({ page }) => {
  const card = region(page, '总览卡片');
  const market = region(page, '市场综合统计');
  await shot(page, 'case_64_before_总览', card);
  await shot(page, 'case_64_mid_市场', market);
  const a = (await page.getByText(/总保费/).locator('xpath=..').innerText()).replace(/[^\d.]/g, '');
  expect(Number(a)).toBeGreaterThan(0);
  await shot(page, 'case_64_after_抽查', card);
});

/* ============ 后台联动类（67-79）===========
   需“录入/编辑/删除订单”权限账号（admin 返回 404，原表标记 BLOCKED）。
   自动化无法在 admin 下执行，集中标注跳过，待销售/渠道账号补测。 */
const blocked = [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
for (const id of blocked) {
  test(`case_${id} 后台联动-需录入权限账号(BLOCKED 跳过)`, async () => {
    test.skip(true, '需具备订单录入权限的销售/渠道账号，admin 下返回 404');
  });
}

/*
  ▶ 截图策略（解决“雷同 / 无前后对比”）：
    - 每个用例至少 before + after 两张，成对出现，变化一眼可见
    - 用 region() 对具体操作区域截图，不同用例截不同区域，不雷同
    - 文件名带 用例号_状态_细节，绝不重名
  ▶ 登录只做一次：共享 page fixture，避免每条用例重登
  ▶ 加载保障：ensureLoaded() 等关键区域；等不到点右上角刷新；
    shot() 截前再等 networkidle + 1.5s，绝不加载中截屏
  ▶ 输出：workspace/screenshots/case_*.png
*/
