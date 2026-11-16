import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const artifacts = resolve('.playwright-mcp/mission');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base, browser: await browser.version(), viewports: [], media: null, failures: [] };
try {
  for (const width of [375, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 375 ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await expect(page.getByRole('button', { name: 'Try a mission', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.screenshot({ path: resolve(artifacts, `opening-${width}.jpg`), type: 'jpeg', quality: 85 });
    await page.getByRole('button', { name: 'Try a mission', exact: true }).click();
    await expect(page.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-01');
    await page.waitForFunction(() => {
      const c = document.querySelector('.scene canvas');
      const ratio = Math.min(devicePixelRatio, 2);
      return c && Math.abs(c.width - c.clientWidth * ratio) < 2 && Math.abs(c.height - c.clientHeight * ratio) < 2;
    });
    await expect(page.locator('.together-readout')).toContainText('0%');
    await page.locator('.timeline-earth .timeline-track').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.moment-explanation')).toContainText('terrain skyline blocks it');
    await expect(page.getByRole('img', { name: /Skyline at Connecting Ridge/ })).toHaveAttribute('aria-label', /Earth:.*hidden by terrain/);
    const slider = page.getByRole('slider', { name: 'Shared timeline moment' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '4 Jan 2027, 12:30 UTC');
    await expect(page.locator('.date-value')).toContainText('4 Jan 2027');
    await expect(page.locator('.date-value')).toContainText('12:30');
    await expect(page.locator('.window-range')).toContainText('1 Jan 2027 → 8 Jan 2027 UTC');
    await expect(page.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-01');
    await page.locator('.mission-prompt .pill').click();
    await expect(page.locator('.mission-comparison')).toContainText('168 more hours together');
    await expect(page.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-10');
    await expect(page.locator('.comparison-state')).not.toContainText('Travelling');
    await expect(page.locator('.comparison-table tbody tr').filter({ hasText: 'Earth in view' })).toContainText('0%100%');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.screenshot({ path: resolve(artifacts, `comparison-${width}.jpg`), type: 'jpeg', quality: 85 });
    await page.getByRole('button', { name: 'Checks & limits', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'How we know' })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]'))), true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Checks & limits', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Return to original window' }).click();
    await expect(page.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-01');
    await expect(page.locator('.mission-comparison')).toHaveCount(0);
    if (width === 375) {
      await page.getByLabel('Scene moment (UTC)', { exact: true }).fill('2027-01-05T09:30');
      await expect(page.locator('.date-value')).toContainText('5 Jan 2027');
      await expect(page.locator('.date-value')).toContainText('09:30');
      await expect(page.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-01');
      await page.getByRole('button', { name: 'Next scene day', exact: true }).click();
      await expect(page.locator('.date-value')).toContainText('6 Jan 2027');
      await page.getByRole('button', { name: 'Previous scene day', exact: true }).click();
      await page.getByLabel('Start date of the window (UTC)').fill('2027-01-02');
      await expect(page.locator('.window-range')).toContainText('2 Jan 2027 → 9 Jan 2027 UTC');
      await expect(page.locator('.date-value')).toContainText('6 Jan 2027');
    }
    if (width === 1280) {
      await page.locator('.mission-prompt .pill').click();
      await expect(page.locator('.mission-comparison')).toBeVisible();
      await expect(page.locator('.comparison-state')).not.toContainText('Travelling');
      await page.getByRole('button', { name: 'More options' }).click();
      await page.getByRole('radio', { name: 'Public', exact: true }).click();
      await page.getByRole('button', { name: 'More options' }).click();
      await page.getByRole('button', { name: 'Play the time-lapse' }).click();
      await page.waitForFunction(() => document.querySelector('input[type="date"]').value !== '2027-01-10');
      await expect(page.locator('.mission-comparison')).toHaveCount(0);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Play the time-lapse' }).click();
      await page.locator('.topbar-right > .pill').first().click();
      await expect(page.getByRole('button', { name: 'Play the time-lapse' })).toBeVisible();
      await expect(page.locator('.mission-comparison')).toBeVisible();
    }
    assert.deepEqual(errors, []);
    report.viewports.push({ width, passed: true, checks: 'mission, canvas resize, linked terrain/cursor, comparison, keyboard dialog, restore; playback at 1280' });
    await context.close();
  }
  const navigation = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const nav = await navigation.newPage();
  const initial = '#date=2026-11-15&days=30&at=2026-11-15T12%3A00Z&site=connecting-ridge&view=planner';
  const shared = '#date=2027-01-01&days=7&at=2027-01-03T12%3A30Z&site=malapert-massif&view=educator';
  await nav.goto(base + '/' + initial);
  await expect(nav.locator('.card')).toBeVisible();
  const totals = await nav.locator('.metrics').innerText();
  await nav.getByRole('button', { name: 'More options' }).click();
  await nav.getByRole('button', { name: 'Calendar of best days' }).click();
  await nav.locator('.calendar-cell[aria-label*="Connecting Ridge, 30 Nov 2026"]').click();
  await expect(nav.locator('.date-value')).toContainText('30 Nov 2026');
  await expect(nav.getByLabel('Start date of the window (UTC)')).toHaveValue('2026-11-15');
  await expect(nav.locator('.metrics')).toHaveText(totals, { useInnerText: true });
  await expect(nav.locator('.window-range')).toContainText('15 Nov 2026 → 15 Dec 2026 UTC');
  await nav.evaluate(hash => {
    window.__navigationSentinel = 'no reload';
    document.querySelector('.topbar-right > .pill').click();
    location.hash = hash;
  }, shared);
  await expect(nav.getByLabel('Start date of the window (UTC)')).toHaveValue('2027-01-01');
  await expect(nav.locator('.date-value')).toContainText('3 Jan 2027');
  await expect(nav.locator('.date-value')).toContainText('12:30');
  await expect(nav.locator('.card-head h1')).toHaveText('Malapert Massif');
  await expect(nav.locator('.app')).toHaveAttribute('data-audience', 'educator');
  await expect(nav.locator('.mission-comparison')).toHaveCount(0);
  assert.equal(await nav.evaluate(() => window.__navigationSentinel), 'no reload');
  await nav.goBack();
  await expect(nav.getByLabel('Start date of the window (UTC)')).toHaveValue('2026-11-15');
  await expect(nav.locator('.date-value')).toContainText('30 Nov 2026');
  await nav.goForward();
  await expect(nav.locator('.card-head h1')).toHaveText('Malapert Massif');
  const fresh = await navigation.newPage();
  await fresh.goto(base + '/' + shared);
  await expect(fresh.locator('.date-value')).toHaveText(await nav.locator('.date-value').innerText());
  await expect(fresh.locator('.window-range')).toHaveText(await nav.locator('.window-range').innerText());
  await expect(fresh.locator('.app')).toHaveAttribute('data-audience', 'educator');
  report.navigation = 'Calendar moment/window distinction, same-tab hash, back/forward and fresh-link restoration passed';
  await navigation.close();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${base}/?guide=1`);
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const asset of ['mission-original.jpg', 'mission-comparison.jpg', 'southlight-walkthrough.mp4', 'walkthrough.vtt', 'walkthrough-transcript.txt', 'project-description.md']) {
    const response = await page.request.get(`${base}/submission/${asset}`);
    assert.equal(response.status(), 200, asset);
    assert((await response.body()).length > 50, asset);
  }
  await page.locator('video').evaluate(async video => { video.muted = true; video.load(); await video.play(); video.pause(); });
  const media = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, captions: video.textTracks.length }));
  assert(media.duration > 20 && media.duration <= 30);
  assert.equal(media.width, 1280);
  assert.equal(media.captions, 1);
  report.media = media;
  await context.close();

  const bootNavigation = await browser.newContext();
  let releaseBoot;
  let sawRequest;
  const held = new Promise(resolve => { releaseBoot = resolve; });
  const intercepted = new Promise(resolve => { sawRequest = resolve; });
  await bootNavigation.route('**/data/ephemeris.bin', async route => { sawRequest(); await held; await route.continue(); });
  const bootPage = await bootNavigation.newPage();
  await bootPage.goto(base + '/' + shared, { waitUntil: 'domcontentloaded' });
  await intercepted;
  await bootPage.evaluate(() => { location.hash = ''; });
  releaseBoot();
  await expect(bootPage.getByRole('button', { name: 'Try a mission', exact: true })).toBeVisible();
  await expect(bootPage.getByRole('button', { name: 'Try a mission', exact: true })).toBeEnabled();
  await bootNavigation.close();

  const failed = await browser.newContext();
  await failed.route('**/data/ephemeris.bin', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  const failedPage = await failed.newPage();
  await failedPage.goto(base);
  await expect(failedPage.getByRole('heading', { name: 'Southlight could not start' })).toBeVisible();
  await failed.close();

  const texture = await browser.newContext();
  await texture.route('**/textures/moon_color.jpg', route => route.abort());
  const texturePage = await texture.newPage();
  await texturePage.goto(base);
  await expect(texturePage.locator('.scene-error')).toContainText('The geometric results and skyline still work');
  await expect(texturePage.locator('.visibility-timeline')).toBeVisible();
  await texture.close();
} catch (error) {
  report.failures.push(error.stack);
  throw error;
} finally {
  await writeFile(resolve(artifacts, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
