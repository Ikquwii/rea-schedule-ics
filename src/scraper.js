import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE_URL = 'https://rasp.rea.ru';
const GROUP = process.env.GROUP || '15.24Д-Э07/24б';
const END_DATE = process.env.END_DATE || '2026-06-27';
const MAX_WEEKS = parseInt(process.env.MAX_WEEKS || '20', 10);

const DAY_HEADER_RE = /(ПОНЕДЕЛЬНИК|ВТОРНИК|СРЕДА|ЧЕТВЕРГ|ПЯТНИЦА|СУББОТА|ВОСКРЕСЕНЬЕ)/i;

async function waitForSchedule(page) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body.innerText);
    if (DAY_HEADER_RE.test(text) || /Занятия отсутствуют/i.test(text)) return text;
    await page.waitForTimeout(500);
  }
  return await page.evaluate(() => document.body.innerText);
}

function lastDateFromText(text) {
  const dates = [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
  if (!dates.length) return null;
  const m = dates.at(-1);
  return new Date(`${m[3]}-${m[2]}-${m[1]}`);
}

export async function scrapeSchedule({ debugHtmlPath } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log(`[scraper] Opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log(`[scraper] Filling group: ${GROUP}`);
  const input = page.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();
  await input.fill('');
  await input.type(GROUP, { delay: 30 });
  await page.waitForTimeout(1500);
  await input.press('Enter');
  await page.waitForTimeout(1500);

  const suggestion = page.locator(`text=${GROUP.replace(/([.\/])/g, '\\$1')}`).first();
  if (await suggestion.count() > 0) {
    try { await suggestion.click({ timeout: 2000 }); } catch {}
  }

  let firstText = await waitForSchedule(page);
  console.log(`[scraper] First render text length: ${firstText.length}`);

  if (debugHtmlPath && !DAY_HEADER_RE.test(firstText)) {
    const html = await page.content();
    await fs.writeFile(debugHtmlPath, html, 'utf8');
    console.log(`[scraper] Saved debug HTML to ${debugHtmlPath}`);
  }

  const endDate = new Date(END_DATE);
  const weeks = [];

  for (let i = 0; i < MAX_WEEKS; i++) {
    console.log(`[scraper] Week ${i + 1}...`);
    const weekText = await waitForSchedule(page);
    weeks.push(weekText);

    const lastDate = lastDateFromText(weekText);
    if (lastDate) console.log(`  last date: ${lastDate.toISOString().slice(0, 10)}`);
    if (lastDate && lastDate >= endDate) {
      console.log(`[scraper] Reached END_DATE ${END_DATE}`);
      break;
    }

    const beforeText = weekText;
    let advanced = false;

    const arrowSelectors = [
      'button[aria-label*="следующ" i]',
      'button[aria-label*="next" i]',
      '[class*="next"]:visible',
      '[class*="arrow-right"]:visible',
      '[class*="chevron-right"]:visible',
      'button:has-text(">")',
      'a:has-text(">")',
    ];
    for (const sel of arrowSelectors) {
      try {
        const btn = page.locator(sel).last();
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 300 }).catch(() => false)) {
          await btn.click({ timeout: 2000 });
          advanced = true;
          console.log(`  clicked: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!advanced) {
      try {
        await page.keyboard.press('ArrowRight');
        advanced = true;
        console.log(`  pressed keyboard ArrowRight`);
      } catch {}
    }

    if (!advanced) {
      console.log(`  no way to advance — stopping`);
      break;
    }

    await page.waitForTimeout(1200);
    const afterText = await page.evaluate(() => document.body.innerText);
    if (afterText === beforeText) {
      console.log(`  text unchanged after advance — stopping`);
      break;
    }
  }

  await browser.close();
  console.log(`[scraper] Collected ${weeks.length} weeks`);
  return weeks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeSchedule({ debugHtmlPath: '/tmp/rea-debug.html' }).then(weeks => {
    console.log('--- First week preview ---');
    console.log(weeks[0]?.slice(0, 2000));
  });
}
