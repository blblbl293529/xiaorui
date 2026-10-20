// Run with NODE_PATH pointing to a Playwright installation, and server.py running.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const item = (id) => ({ id, title: `<b>${id}</b>`, url: `https://www.bilibili.com/video/${id}`,
    source: '测试来源', publishedAt: new Date(Date.now() - 3600000).toISOString(), description: '测试说明' });
  let payload = { date, refreshedAt: new Date().toISOString(), sections: Object.fromEntries(
    ['legs', 'glutes', 'stretch', 'video', 'photo', 'article'].map(key =>
      [key, { status: 'fresh', item: item(key), selectedDate: date, message: '' }])) };
  let offline = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/daily')) {
      if (offline) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    }
    if (url.hostname === '127.0.0.1') return route.continue();
    return route.abort();
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#daily-content-status').filter({ hasText: '图文 2/2' }).waitFor({ state: 'attached' });
  await page.getByRole('button', { name: '💪 健康', exact: true }).click();
  assert.equal(await page.locator('#workout-videos .daily-section').count(), 3);
  assert.equal(await page.locator('#workout-videos b').count(), 0, 'source HTML must remain text');
  await page.getByRole('button', { name: '标记完成', exact: true }).first().click();
  assert.equal(await page.getByRole('button', { name: '今日已完成', exact: true }).count(), 1);
  await page.reload();
  await page.locator('#daily-content-status').filter({ hasText: '图文 2/2' }).waitFor({ state: 'attached' });
  assert.equal(await page.locator('.workout-done[aria-pressed=true]').count(), 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'mobile viewport must not overflow');
  await page.getByRole('button', { name: '✨ 发现', exact: true }).click();
  assert.match(await page.locator('#video-body a').first().getAttribute('href'), /^https:\/\/www\.douyin\.com\/search\//);
  assert.equal(await page.locator('#workout-videos a[href*="bilibili"]').count(), 0);
  assert.equal(await page.locator('#article-text b').count(), 0);
  // A successful but old server response must never be presented as fresh.
  payload.date = '2026-01-01';
  for (const section of Object.values(payload.sections)) section.selectedDate = '2026-01-01';
  await page.locator('#btn-refresh-content').click();
  await page.locator('#daily-content-status').filter({ hasText: '2026-01-01' }).waitFor();
  assert.equal(await page.locator('.workout-done').count(), 3, 'search-based daily progress does not depend on an old content payload');
  offline = true;
  await page.locator('#btn-refresh-content').click();
  await page.locator('#daily-content-status').filter({ hasText: '缓存' }).waitFor();
  assert.match(await page.locator('#article-text').innerText(), /2026-01-01/);
  assert.deepEqual(errors, []);
  await context.close();
  // Actual local API, without mocked daily data. Other third-party app requests remain external.
  const liveContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const live = await liveContext.newPage();
  await live.goto('http://127.0.0.1:8765/');
  await live.locator('#daily-content-status').filter({ hasText: '最近检查' }).waitFor({ state: 'attached', timeout: 55000 });
  await live.getByRole('button', { name: '✨ 发现', exact: true }).click();
  const out = path.resolve('.local');
  fs.mkdirSync(out, { recursive: true });
  await live.locator('#photo-body').scrollIntoViewIfNeeded();
  await live.waitForFunction(() => [...document.querySelectorAll('#photo-body img')].every(img => img.complete), { timeout: 15000 }).catch(() => {});
  await live.screenshot({ path: path.join(out, 'discover-mobile.png'), fullPage: true, animations: 'disabled' });
  await live.getByRole('button', { name: '💪 健康', exact: true }).click();
  await live.screenshot({ path: path.join(out, 'workout-mobile.png'), fullPage: true, animations: 'disabled' });
  console.log('PASS: mobile UI, DOM isolation, completion persistence, stale/offline handling, live preview');
  await browser.close();
}
main().catch(err => { console.error(err); process.exit(1); });
