// Browser checks for the window summary line, the Nearest PSR readout and the
// lunar-day / one-year window presets. Expected summary values come from the SPICE
// reference fixture (tools/build_golden.py); PSR distances from src/engine/psr.test.ts.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const artifacts = resolve('.playwright-mcp/psr-presets');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, browser: await browser.version(), summaries: [], psr: null, presets: null, search: null, fit: [], errors: [] };
const link = (date, days, site) => `${base}/#date=${date}&days=${days}&at=${date}T00%3A00Z&site=${site}&view=planner`;
const text = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
// Load fresh each time: a change after "#" alone would not reload the page.
const open = async (page, url) => { await page.goto('about:blank'); await page.goto(url); await page.locator('.window-summary').waitFor(); };

const SUMMARIES = [
  ['2027-06-01', 30, 'connecting-ridge', 'Operable 13 of 30 days in this window — first dark stretch of 48 h or longer starts 13 Jun 2027, 10:30 UTC.'],
  ['2026-11-14', 30, 'malapert-massif', 'Operable 19 of 30 days in this window — first dark stretch of 48 h or longer starts 14 Nov 2026, 02:00 UTC.'],
  ['2027-01-10', 7, 'nobile-rim-1', 'Operable 6 of 7 days in this window — no dark stretch of 48 h or longer.'],
  ['2027-01-01', 29.5, 'connecting-ridge', 'Operable 14 of 29.5 days in this window — no dark stretch of 48 h or longer.'],
];
const PSR = { 'Connecting Ridge': '15.5 km', 'Malapert Massif': '33.4 km', 'Nobile Rim 1': '19.0 km' };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));

  for (const [date, days, site, expected] of SUMMARIES) {
    await open(page, link(date, days, site));
    assert.equal(text(await page.locator('.window-summary').innerText()), expected, `${site} ${date} ${days}d`);
    report.summaries.push({ date, days, site, text: expected });
  }

  // The line follows the window: 30 days, then 7, from the same start.
  await open(page, link('2027-01-01', 30, 'connecting-ridge'));
  const thirty = text(await page.locator('.window-summary').innerText());
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('radio', { name: '7 days', exact: true }).click();
  await expect(page.locator('.window-summary')).toHaveText(/Operable 0 of 7 days in this window/);
  assert.notEqual(text(await page.locator('.window-summary').innerText()), thirty);

  // Presets: the menu sets the window, the label and the link.
  for (const [label, days, eyebrow] of [['1 lunar day', '29.5', 'LUNAR-DAY ASSESSMENT WINDOW'], ['1 year', '365', '1-YEAR ASSESSMENT WINDOW']]) {
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.locator('.assessment-window .eyebrow')).toHaveText(new RegExp(eyebrow, 'i'));
    await expect.poll(() => new URL(page.url()).hash).toContain(`days=${days}`);
  }
  await page.locator('.menu').screenshot({ path: resolve(artifacts, 'menu.png') });
  await page.keyboard.press('Escape');
  await open(page, link('2027-01-01', 29.5, 'nobile-rim-1'));
  await expect(page.locator('.window-range')).toHaveText('1 Jan 2027 → 30 Jan 2027, 12:00 UTC');
  report.presets = { lunarDay: '29.5 days, link restores', year: '365 days, link restores' };

  await open(page, link('2027-01-01', 365, 'connecting-ridge'));
  // Nearest PSR on the card for each site, in the comparison table, and in How we know.
  const seen = {};
  for (const name of Object.keys(PSR)) {
    await page.locator('.all-sites').getByText(name, { exact: true }).click();
    await expect(page.locator('.card-head h1')).toHaveText(name);
    seen[name] = text(await page.locator('.metric-psr .numeral').innerText());
    assert.equal(seen[name], PSR[name], name);
    await expect(page.locator('.metric-psr p')).toContainText('water-ice target');
  }
  // Find a better window over a year of one-year windows.
  await page.locator('.all-sites').getByText('Connecting Ridge', { exact: true }).click();
  const t0 = Date.now();
  await page.locator('.topbar-right').getByRole('button', { name: 'Find a better window', exact: true }).click();
  await expect(page.locator('.mission-comparison')).toBeVisible({ timeout: 10_000 });
  const searchMs = Date.now() - t0;
  assert.ok(searchMs < 1500, `One-year search took ${searchMs} ms`);
  await expect(page.locator('.mission-comparison')).toContainText('Comparing two 1-year windows');
  report.search = { windowDays: 365, startsSearched: 365, ms: searchMs };
  await page.screenshot({ path: resolve(artifacts, 'year-search.png') });

  await page.getByRole('button', { name: 'Compare sites', exact: true }).click();
  const row = page.locator('.site-comparison-table tbody tr').filter({ has: page.getByRole('rowheader', { name: 'Nearest PSR', exact: true }) });
  const cells = (await row.locator('td').allInnerTexts()).map(text);
  assert.deepEqual(cells, ['15.5 km de Gerlache / Shackleton', '33.4 km Haworth / Malapert / Cabeus', '19.0 km Nobile']);
  const calendar = await page.locator('.calendar-scroll').evaluate((el) => ({
    long: el.dataset.long, cells: el.querySelectorAll('.calendar-cell').length, scrolls: el.scrollWidth > el.clientWidth, page: document.documentElement.scrollWidth,
  }));
  assert.deepEqual([calendar.long, calendar.cells, calendar.scrolls, calendar.page], ['true', 1095, true, 1280]);
  await page.keyboard.press('Escape');
  await page.locator('.topbar-right').getByRole('button', { name: 'How we know', exact: true }).click();
  const water = page.locator('.sheet-body > section').filter({ has: page.getByRole('heading', { name: 'Water-ice targets' }) });
  await expect(water).toContainText('does not mean ice has been confirmed');
  await expect(water).toContainText('LROC PSR Atlas');
  await expect(water).toContainText('Mazarico et al. (2011)');
  await expect(water.locator('tbody tr')).toHaveCount(3);
  await water.screenshot({ path: resolve(artifacts, 'how-we-know.png') });
  report.psr = { card: seen, table: cells, calendar };
  await context.close();

  // The card fits without inner scrolling at phone, tablet and laptop widths.
  for (const width of [375, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => report.errors.push(e.message));
    const measure = (state) => p.locator('.card').evaluate((card, state) => {
      const r = card.getBoundingClientRect();
      return { state, width: innerWidth, height: Math.round(r.height), bottom: Math.round(r.bottom), scroll: card.scrollHeight, client: card.clientHeight, page: document.documentElement.scrollWidth };
    }, state);
    for (const [state, url] of [['30 days', link('2027-06-01', 30, 'connecting-ridge')], ['1 year', link('2027-01-01', 365, 'malapert-massif')]]) {
      await open(p, url);
      report.fit.push(await measure(state));
    }
    await p.goto('about:blank');
    await p.goto(base);
    await p.getByRole('button', { name: 'Try a mission', exact: true }).click();
    await p.locator('.window-summary').waitFor();
    report.fit.push(await measure('mission'));
    await p.locator('.card').screenshot({ path: resolve(artifacts, `card-mission-${width}.png`) });
    await ctx.close();
  }
  for (const f of report.fit) {
    assert.equal(f.page, f.width, `page scrolls sideways: ${JSON.stringify(f)}`);
    assert.ok(f.height <= 800, `card too tall: ${JSON.stringify(f)}`);
    assert.ok(f.scroll <= f.client + 1, `card content clipped: ${JSON.stringify(f)}`);
    if (f.width >= 1080) assert.ok(f.bottom <= 800, `card runs off screen: ${JSON.stringify(f)}`);
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(resolve(artifacts, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
