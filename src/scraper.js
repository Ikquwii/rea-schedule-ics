import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'https://rasp.rea.ru';
const GROUP = process.env.GROUP || '15.24Д-Э07/24б';
const OUTPUT_ICS = process.env.OUTPUT || 'public/schedule.ics';
const DEBUG_DIR = 'public/debug';

async function waitForSchedule(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page.evaluate(() => {
      const txt = document.body.innerText;
      return /ПОНЕДЕЛЬНИК|ВТОРНИК|СРЕДА|ЧЕТВЕРГ|ПЯТНИЦА|СУББОТА|Занятия отсутствуют/i.test(txt);
    });
    if (found) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

export async function exportIcs() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  await fs.mkdir(DEBUG_DIR, { recursive: true });

  console.log(`[scraper] Opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log(`[scraper] Filling #search with group: ${GROUP}`);
  const search = page.locator('#search');
  await search.waitFor({ state: 'visible', timeout: 15000 });
  await search.click();
  await search.fill('');
  await search.type(GROUP, { delay: 40 });
  await page.waitForTimeout(1200);
  await search.press('Enter');

  const rendered = await waitForSchedule(page);
  if (!rendered) {
    console.error('[scraper] Schedule did not render. Saving debug HTML...');
    await fs.writeFile(path.join(DEBUG_DIR, 'page-after-search.html'), await page.content(), 'utf8');
    await fs.writeFile(path.join(DEBUG_DIR, 'page-after-search.txt'), await page.evaluate(() => document.body.innerText), 'utf8');
    await browser.close();
    throw new Error('Schedule did not render after group search');
  }
  console.log('[scraper] Schedule rendered ✓');

  console.log('[scraper] Opening export modal via jQuery...');
  await page.evaluate(() => window.jQuery && window.jQuery('#modal-export-dlg').modal('show'));
  await page.waitForSelector('#modal-export-dlg.show, #modal-export-dlg[style*="display: block"]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  console.log('[scraper] Selecting "За всё время" (all)...');
  await page.evaluate(() => {
    const radio = document.querySelector('input.export-range[value="all"]');
    if (radio) {
      radio.checked = true;
      const label = radio.closest('label');
      if (label) {
        document.querySelectorAll('.btn-export-range').forEach(l => l.classList.remove('active'));
        label.classList.add('active');
      }
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click', { bubbles: true }));
    }
  });
  await page.waitForTimeout(500);

  console.log('[scraper] Clicking #calexport and waiting for download...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('#calexport'),
  ]);

  const suggestedName = download.suggestedFilename();
  console.log(`[scraper] Got download: ${suggestedName}`);

  await fs.mkdir(path.dirname(OUTPUT_ICS), { recursive: true });
  await download.saveAs(OUTPUT_ICS);

  const stat = await fs.stat(OUTPUT_ICS);
  console.log(`[scraper] Saved ${OUTPUT_ICS} (${stat.size} bytes)`);

  await browser.close();
  return { outputPath: OUTPUT_ICS, size: stat.size, suggestedName };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportIcs().then(r => console.log('DONE:', r)).catch(e => { console.error(e); process.exit(1); });
}
