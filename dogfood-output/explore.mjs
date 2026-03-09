#!/usr/bin/env node
/** Playwright dogfood exploration script for mpad */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'dogfood-output', 'screenshots');

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  });

  const consoleLogs = [];
  const consoleErrors = [];
  context.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') consoleErrors.push(text);
    else consoleLogs.push({ type, text });
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 10000 });

  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(OUT, 'initial-load.png'), fullPage: true });
  const title = await page.title();
  console.log('Page title:', title);

  // Try Cmd+K (palette) - use Ctrl+K on Linux
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'cmd-k-palette.png'), fullPage: true });

  // Close palette with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Type in empty editor area to see if TipTap initializes (no file loaded, so may show empty)
  const emptyText = await page.locator('.empty-state').textContent();
  console.log('Empty state text:', emptyText?.trim());

  // Toggle sidebar (Cmd+B / Ctrl+B)
  await page.keyboard.press('Meta+b');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'sidebar-open.png'), fullPage: true });

  await page.keyboard.press('Meta+b');
  await page.waitForTimeout(300);

  // Open palette, type to filter
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(400);
  await page.keyboard.type('save');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'palette-typed-save.png'), fullPage: true });
  await page.keyboard.press('Escape');

  // Cmd+/ source toggle (no file - check no crash)
  await page.keyboard.press('Meta+/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'after-source-toggle.png'), fullPage: true });

  // Cmd+F find (no file)
  await page.keyboard.press('Meta+f');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'find-no-file.png'), fullPage: true });
  await page.keyboard.press('Escape');

  writeFileSync(join(OUT, 'console-errors.txt'), consoleErrors.join('\n'));
  writeFileSync(join(OUT, 'console-logs.txt'), consoleLogs.map((l) => `[${l.type}] ${l.text}`).join('\n'));

  await browser.close();
  return { title, consoleErrors, consoleLogs };
};

main()
  .then((r) => {
    console.log('Exploration done.');
    console.log('Console errors:', r.consoleErrors.length);
    r.consoleErrors.forEach((e) => console.log('  -', e));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
