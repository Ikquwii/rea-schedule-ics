import { chromium } from 'playwright';

const BASE_URL = 'https://rasp.rea.ru';
const GROUP = process.env.GROUP || '15.24Д-Э07/24б';
const END_DATE = process.env.END_DATE || '2026-06-27';
const MAX_WEEKS = parseInt(process.env.MAX_WEEKS || '20', 10);

export async function scrapeSchedule() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log(`[scraper] Opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  console.log(`[scraper] Searching for group: ${GROUP}`);
  const searchInput = page.locator('input[type="text"], input[type="search"]').first();
  await searchInput.waitFor({ state: 'visible', timeout: 10000 });
  await searchInput.fill(GROUP);
  await page.waitForTimeout(1500);

  const groupCard = page.locator(`text=${GROUP}`).first();
  if (await groupCard.count() > 0) {
    await groupCard.click();
  } else {
    await searchInput.press('Enter');
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const endDate = new Date(END_DATE);
  const weeks = [];
  let guard = 0;

  while (guard < MAX_WEEKS) {
    guard++;
    console.log(`[scraper] Scraping week ${guard}...`);

    await page.waitForTimeout(1500);
    const weekText = await page.evaluate(() => document.body.innerText);
    weeks.push(weekText);

    const dateMatches = [...weekText.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
    const lastDate = dateMatches.length
      ? new Date(`${dateMatches.at(-1)[3]}-${dateMatches.at(-1)[2]}-${dateMatches.at(-1)[1]}`)
      : null;

    if (lastDate && lastDate >= endDate) {
      console.log(`[scraper] Reached end date ${END_DATE}`);
      break;
    }

    const nextBtn = page.locator('button:has-text(">"), [aria-label*="след"], [aria-label*="next"]').first();
    if (await nextBtn.count() === 0) {
      console.log(`[scraper] No "next week" button found, stopping`);
      break;
    }
    await nextBtn.click();
  }

  await browser.close();
  console.log(`[scraper] Collected ${weeks.length} weeks`);
  return weeks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeSchedule().then(weeks => {
    console.log('--- First week preview ---');
    console.log(weeks[0]?.slice(0, 1500));
  });
}
