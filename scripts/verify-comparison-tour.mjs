import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const artifacts = resolve('.playwright-mcp/comparison-tour');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, browser: await browser.version(), viewports: [], gaps: [], tour: null, errors: [] };
const url = date => `${base}/#date=${date}&days=7&at=${date}T00%3A00Z&site=connecting-ridge&view=planner`;
try {
  for (const width of [375, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(url('2027-01-01'));
    await page.getByRole('button', { name: 'Compare sites', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Compare sites and days' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.site-comparison-table thead th')).toHaveCount(3);
    const gapRow = page.locator('.site-comparison-table tbody tr').filter({ has: page.getByRole('rowheader', { name: 'Longest Earth gap', exact: true }) });
    await expect(gapRow.locator('td')).toHaveText(['7 days', 'none', '7 days']);
    await page.getByRole('radio', { name: 'Sunlight', exact: true }).click();
    await expect(page.locator('.calendar-cell').first()).toHaveAttribute('aria-label', /Sunlight 100%/);
    const sunColor = await page.locator('.calendar-cell').first().evaluate(el => getComputedStyle(el).backgroundColor);
    await page.getByRole('radio', { name: 'Earth', exact: true }).click();
    await expect(page.locator('.calendar-cell').first()).toHaveAttribute('aria-label', /Earth visibility 0%/);
    assert.notEqual(sunColor, await page.locator('.calendar-cell').first().evaluate(el => getComputedStyle(el).backgroundColor));
    await page.getByRole('radio', { name: 'Both', exact: true }).click();
    await expect(page.locator('.calendar-cell').first()).toHaveAttribute('aria-label', /Sun and Earth together 0%/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    const bounds = await page.locator('.site-comparison-scroll').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight }));
    // Every metric row must be on screen, not hidden behind an inner vertical scroll.
    assert.ok(bounds.height >= bounds.contentHeight, `comparison table clipped at ${width}px: ${bounds.height} of ${bounds.contentHeight}px shown`);
    if (width === 375) assert.ok(bounds.content > bounds.width);
    await page.screenshot({ path: resolve(artifacts, `comparison-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: 'Malapert Massif', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.card-head h1')).toHaveText('Malapert Massif');
    await expect(page.locator('.pin[aria-pressed="true"]')).toHaveAttribute('aria-label', /^Malapert Massif/);
    await expect(page.getByRole('button', { name: 'Whole Moon', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.goto(url('2027-01-10'));
    await page.getByRole('button', { name: 'Compare sites', exact: true }).click();
    await expect(gapRow.locator('td')).toHaveText(['none', 'none', '10 h']);
    report.gaps.push({ width, jan1: [168, 0, 168], jan10: [0, 0, 10], units: 'hours', source: 'SPICE/Python reference fixtures' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Compare sites', exact: true })).toBeFocused();
    if (width === 1280) {
      await page.locator('.site-details > summary').click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
      const exported = await download;
      const csv = await readFile(await exported.path(), 'utf8');
      assert.ok(csv.includes('# Longest Earth visibility gap (hours below half-disc visibility within this window),0'));
    }
    if (width === 375) {
      await page.getByRole('button', { name: 'Play a lunar month', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Replay lunar month', exact: true })).toBeVisible();
      await expect(page.locator('.date-value')).toContainText('8 Feb 2027');
      await expect(page.locator('.toast')).toContainText('Reduced motion');
    }
    report.viewports.push({ width, passed: true, table: bounds });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(url('2027-01-01'));
  await page.locator('.site-row[data-site="connecting-ridge"]').click();
  await page.getByRole('button', { name: 'Play a lunar month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Whole Moon', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.window-range')).toHaveText('1 Jan 2027 → 31 Jan 2027 UTC');
  const totals = await page.locator('.metrics').innerText();
  const sites = await page.locator('.all-sites').innerText();
  await page.locator('.site-details > summary').click();
  await page.locator('.timeline-skyline > summary').click();
  await expect(page.getByRole('img', { name: /Skyline at Connecting Ridge/ })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Pause lunar month', exact: true }).click();
  const paused = await page.locator('.date-value').innerText();
  const timelineMoment = await page.locator('.moment-readout').innerText();
  await page.waitForTimeout(350);
  await expect(page.locator('.date-value')).toHaveText(paused, { useInnerText: true });
  await expect(page.locator('.moment-readout')).toHaveText(timelineMoment, { useInnerText: true });
  await page.getByRole('button', { name: 'Resume lunar month', exact: true }).click();
  await page.getByRole('button', { name: 'Compare sites', exact: true }).click();
  await expect(page.locator('.month-tour-control button')).toHaveText('Resume lunar month');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume lunar month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay lunar month', exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.date-value')).toContainText('30 Jan 2027');
  await expect(page.locator('.date-value')).toContainText('23:30');
  await expect(page.locator('.moment-readout')).toContainText('30 Jan 2027, 23:30 UTC');
  assert.equal(await page.locator('.metrics').innerText(), totals);
  assert.equal(await page.locator('.all-sites').innerText(), sites);
  await page.screenshot({ path: resolve(artifacts, 'tour-complete.png') });
  await page.getByRole('button', { name: 'Replay lunar month', exact: true }).click();
  await expect(page.locator('.date-value')).toContainText('1 Jan 2027');
  await page.evaluate(() => { location.hash = '#date=2027-01-10&days=7&at=2027-01-10T00%3A00Z&site=nobile-rim-1&view=planner'; });
  await expect(page.getByRole('button', { name: 'Play a lunar month', exact: true })).toBeVisible();
  await expect(page.locator('.card-head h1')).toHaveText('Nobile Rim 1');
  report.tour = { passed: true, end: '2027-01-30T23:30Z', fixedTotals: true, pauseResumeReplay: true, navigationCancels: true };
  await context.close();
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(resolve(artifacts, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
