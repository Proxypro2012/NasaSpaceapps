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
    }
    assert.deepEqual(errors, []);
    report.viewports.push({ width, passed: true, checks: 'mission, canvas resize, linked terrain/cursor, comparison, keyboard dialog, restore; playback at 1280' });
    await context.close();
  }
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
