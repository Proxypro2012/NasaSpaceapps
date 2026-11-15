import { chromium } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const directory = resolve('.playwright-mcp/lighthouse');
await mkdir(directory, { recursive: true });
const summary = [];
for (const device of ['desktop', 'mobile']) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--remote-debugging-port=9223'] });
  try {
    const page = await browser.newPage();
    await page.goto(base);
    const result = await playAudit({ page, url: base, port: 9223,
      config: device === 'desktop' ? desktop : undefined,
      thresholds: { performance: 100, accessibility: 100, 'best-practices': 100, seo: 100 },
      disableLogs: true, ignoreError: true,
      reports: { directory, name: device, formats: { json: true, html: true } },
    });
    const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([name, category]) => [name, Math.round(category.score * 100)]));
    const metrics = Object.fromEntries(['largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'first-contentful-paint'].map(id => [id, result.lhr.audits[id]?.displayValue]));
    const failures = Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative').map(a => ({ id: a.id, title: a.title, displayValue: a.displayValue }));
    summary.push({ device, scores, metrics, failures });
    console.log(JSON.stringify(summary.at(-1)));
  } finally { await browser.close(); }
}
await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ base, summary }, null, 2));
