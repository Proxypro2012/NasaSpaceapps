import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const assets = resolve('public/submission');
await mkdir(assets, { recursive: true });
await mkdir('/tmp/southlight-recordings', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference',
  recordVideo: { dir: '/tmp/southlight-recordings', size: { width: 1280, height: 800 } } });
const rawStart = performance.now();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base);
await page.getByRole('button', { name: 'Try a mission', exact: true }).waitFor();
await page.waitForLoadState('networkidle');
const offsetSeconds = (performance.now() - rawStart) / 1000;
const tourStart = performance.now();
await page.evaluate(() => {
  const caption = document.createElement('div');
  caption.id = 'recording-caption';
  caption.style.cssText = 'position:fixed;left:32px;bottom:16px;max-width:740px;padding:12px 20px;background:rgba(9,16,34,.96);color:#fff4e4;border:1px solid rgba(255,244,228,.25);border-radius:12px;font:500 19px/1.4 Arial,sans-serif;text-align:center;z-index:1000;pointer-events:none;white-space:pre-line';
  document.body.append(caption);
});
const caption = text => page.locator('#recording-caption').evaluate((el, text) => { el.textContent = text; }, text);
const at = async seconds => {
  const remaining = seconds * 1000 - (performance.now() - tourStart);
  if (remaining > 0) await page.waitForTimeout(remaining);
};
await caption('Find seven days with sunlight and Earth in view.\nSouthlight connects NASA geometry and lunar terrain.');
await at(3);
await page.getByRole('button', { name: 'Try a mission', exact: true }).click();
await caption('Connecting Ridge, 1 January 2027: sunlight 100%,\nbut Earth is hidden for the entire seven-day window.');
await at(8);
await page.locator('.site-details > summary').click();
await page.locator('.timeline-earth .timeline-track').focus();
await page.keyboard.press('Enter');
await caption('Select an unavailable period. The shared cursor\nreveals the terrain obstruction in the skyline.');
await page.evaluate(() => {
  const card = document.querySelector('.card');
  const timeline = document.querySelector('.visibility-timeline');
  card.scrollTo({ top: timeline.offsetTop - 20, behavior: 'smooth' });
});
await at(12);
await page.getByRole('button', { name: 'Whole Moon', exact: true }).click();
await page.waitForFunction(() => document.querySelector('.scene-tools button')?.getAttribute('aria-pressed') === 'true');
await at(13.5);
await page.locator('.topbar-right > .pill').first().click();
await caption('Find a better window. The scene accelerates\nthrough real dates, then slows at the recommendation.');
await at(19);
await caption('Start nine days later: both are visible for 100%\nof the sampled window. The original stays beside it.');
await at(24);
await page.locator('.topbar-right').getByRole('button', { name: 'How we know', exact: true }).click();
await caption('Inspect NASA sources, direction validation and\nterrain sensitivity. Visibility is not landing safety.');
await page.locator('.sheet-body').evaluate(el => el.scrollTo({ top: 300, behavior: 'smooth' }));
await at(28.2);
await page.locator('.sheet-head .round-x').click();
await caption('Southlight. A clearer view of the next landing.');
await at(29.8);
const video = page.video();
await context.close();
await video.saveAs('/tmp/southlight-walkthrough.webm');
const stills = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const still = await stills.newPage();
await still.goto(base);
await still.waitForLoadState('networkidle');
await still.screenshot({ path: resolve(assets, 'opening-desktop.jpg'), type: 'jpeg', quality: 92 });
await still.getByRole('button', { name: 'Try a mission', exact: true }).click();
await still.screenshot({ path: resolve(assets, 'mission-original.jpg'), type: 'jpeg', quality: 92 });
await still.locator('.mission-prompt .pill').click();
await still.locator('.mission-comparison').waitFor();
await still.screenshot({ path: resolve(assets, 'mission-comparison.jpg'), type: 'jpeg', quality: 92 });
await stills.close();
await browser.close();
await promisify(execFile)('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-ss', String(offsetSeconds), '-i', '/tmp/southlight-walkthrough.webm', '-t', '29.6',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-an', resolve(assets, 'southlight-walkthrough.mp4')]);
await writeFile('/tmp/southlight-recording.json', JSON.stringify({ offsetSeconds, durationSeconds: 29.6, errors }, null, 2));
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ offsetSeconds, video: '/tmp/southlight-walkthrough.webm', durationSeconds: 29.6 }));
