import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const artifacts = resolve('.playwright-mcp/all-sites');
await mkdir(artifacts, { recursive: true });
// Read the existing engine and published data without changing or exposing either.
const modules = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const [{ Ephemeris }, { makeSite }, { windowMetrics }] = await Promise.all([
  modules.ssrLoadModule('/src/engine/ephemeris.ts'), modules.ssrLoadModule('/src/engine/site.ts'), modules.ssrLoadModule('/src/engine/metrics.ts'),
]);
const json = async name => JSON.parse(await readFile(resolve('public/data', name), 'utf8'));
const floats = async name => {
  const bytes = await readFile(resolve('public/data', name));
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const eph = new Ephemeris(await json('ephemeris.json'), await floats('ephemeris.bin'));
const sitesFile = await json('sites.json');
const sites = await Promise.all(sitesFile.sites.map(async site => makeSite(site, await floats(site.horizon_file), sitesFile, await floats(site.comparison_horizon_file))));
const days = 30;
const dates = ['2026-11-15', '2027-01-01', '2027-06-01'];
const expected = Object.fromEntries(dates.map(date => [date, sites.map(site => ({ id: site.id, name: site.name, ...windowMetrics(eph, site, Date.parse(date + 'T00:00:00Z'), days) }))]));
await modules.close();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, browser: await browser.version(), dates: [], viewports: [], motion: [], errors: [] };
const pct = value => `${Math.round(value)}%`;
const link = date => `${base}/#date=${date}&days=${days}&at=${date}T12%3A00Z&site=connecting-ridge&view=planner`;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(link(dates[0]));
  await expect(page.locator('.pin[data-verdict]')).toHaveCount(3);
  for (const date of dates) {
    await page.getByLabel('Start date of the window (UTC)').fill(date);
    for (const site of expected[date]) {
      const row = page.locator(`.site-row[data-site="${site.id}"]`);
      const pin = page.locator('.pin').filter({ has: page.locator('.pin-name', { hasText: site.name }) });
      await expect(row).toHaveAttribute('data-verdict', site.verdict);
      await expect(row.locator('.site-verdict')).toHaveText(`${site.verdict} sunlight conditions`);
      await expect(row.locator('.site-sun')).toHaveText(`Sunlight ${pct(site.sunlightPct)}`);
      await expect(row.locator('.site-earth')).toHaveText(`Earth link visibility ${pct(site.earthLinkPct)}`);
      await expect(pin).toHaveAttribute('data-verdict', site.verdict);
      assert.equal(await row.locator('.site-dot').evaluate(el => getComputedStyle(el).backgroundColor), await pin.locator('.pin-dot').evaluate(el => getComputedStyle(el).backgroundColor));
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.site-row[aria-pressed="true"]')).toHaveCount(1);
      await expect(pin).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.card-head h1')).toHaveText(site.name);
      await expect(page.getByRole('button', { name: 'Whole Moon', exact: true })).toHaveAttribute('aria-pressed', 'false');
      // The already-selected row must also refocus after a camera reset.
      await page.getByRole('button', { name: 'Whole Moon', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Whole Moon', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await row.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Whole Moon', exact: true })).toHaveAttribute('aria-pressed', 'false');
    }
    report.dates.push({ date, days, sites: expected[date].map(({ name, verdict, sunlightPct, earthLinkPct }) => ({ name, verdict, sunlight: pct(sunlightPct), earthLink: pct(earthLinkPct) })) });
  }
  // Inspecting a moment inside the window preserves every row's totals.
  const totals = await page.locator('.all-sites').innerText();
  await page.getByLabel('Scene moment (UTC)', { exact: true }).fill('2027-06-14T09:30');
  assert.equal(await page.locator('.all-sites').innerText(), totals);
  await page.locator('.site-details > summary').click();
  await expect(page.locator('.visibility-timeline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checks & limits', exact: true })).toBeVisible();
  await page.locator('.site-details > summary').click();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('.card').scrollIntoViewIfNeeded();
    const fit = await page.evaluate(() => {
      const card = document.querySelector('.card');
      const rect = card.getBoundingClientRect();
      return { width: innerWidth, horizontal: document.documentElement.scrollWidth, cardHeight: rect.height, cardScroll: card.scrollHeight, cardClient: card.clientHeight,
        stripHeight: document.querySelector('.all-sites').getBoundingClientRect().height, rowsFit: [...document.querySelectorAll('.site-row')].every(row => row.scrollWidth <= row.clientWidth), bottom: rect.bottom };
    });
    assert.equal(fit.horizontal, width);
    assert.equal(fit.rowsFit, true);
    assert.ok(fit.stripHeight <= 160);
    assert.ok(fit.cardHeight <= 800, `Card too tall at ${width}: ${fit.cardHeight}`);
    if (width >= 1080) assert.ok(fit.bottom <= 800);
    await page.screenshot({ path: resolve(artifacts, `${width}.png`), fullPage: width < 1080 });
    report.viewports.push(fit);
  }
  await page.goto(base);
  await page.getByRole('button', { name: 'Try a mission', exact: true }).click();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const fit = await page.locator('.card').evaluate(card => ({ width: innerWidth, height: card.getBoundingClientRect().height, scroll: card.scrollHeight, client: card.clientHeight }));
    assert.ok(fit.height <= 800, `Mission card too tall at ${width}`);
    assert.equal(fit.scroll, fit.client, `Collapsed mission content clips at ${width}`);
    report.viewports.push({ ...fit, mission: true });
  }
  await context.close();

  const motion = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  const moving = await motion.newPage();
  moving.on('pageerror', error => report.errors.push(error.message));
  await moving.goto(link(dates[0]));
  await expect(moving.locator('.pin[data-verdict]')).toHaveCount(3);
  await moving.evaluate(() => {
    window.__siteSamples = [];
    const sample = () => {
      window.__siteSamples.push({ time: performance.now(), sites: [...document.querySelectorAll('.site-row')].map(row => {
        const name = row.querySelector('.site-name').textContent;
        const pin = [...document.querySelectorAll('.pin')].find(pin => pin.querySelector('.pin-name').textContent === name);
        return { name, verdict: row.dataset.verdict, pinVerdict: pin?.dataset.verdict, sun: row.querySelector('.site-sun').textContent, earth: row.querySelector('.site-earth').textContent };
      }) });
      if (window.__siteSamples.length < 500) window.__siteSampleFrame = requestAnimationFrame(sample);
    };
    window.__siteSampleFrame = requestAnimationFrame(sample);
  });
  await moving.getByLabel('Start date of the window (UTC)').fill(dates[1]);
  await expect(moving.locator('.date-value')).toContainText('1 Jan 2027', { timeout: 5000 });
  await expect(moving.locator('.site-row').first().locator('.site-sun')).toHaveText(`Sunlight ${pct(expected[dates[1]][0].sunlightPct)}`);
  const samples = await moving.evaluate(() => { cancelAnimationFrame(window.__siteSampleFrame); return window.__siteSamples; });
  for (const sample of samples) for (const site of sample.sites) assert.equal(site.verdict, site.pinVerdict, `Row/pin mismatch for ${site.name}`);
  assert.ok(samples.some(sample => sample.sites.some((site, i) => site.sun !== `Sunlight ${pct(expected[dates[0]][i].sunlightPct)}` && site.sun !== `Sunlight ${pct(expected[dates[1]][i].sunlightPct)}` || site.earth !== `Earth link visibility ${pct(expected[dates[0]][i].earthLinkPct)}` && site.earth !== `Earth link visibility ${pct(expected[dates[1]][i].earthLinkPct)}`)), 'Percentages should count through intermediate values');
  report.motion = samples;
  await motion.close();
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(resolve(artifacts, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ ...report, motion: `${report.motion.length} animation frames checked for row/pin agreement` }, null, 2));
