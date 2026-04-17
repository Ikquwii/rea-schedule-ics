import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapeSchedule } from './scraper.js';
import { parseAllWeeks } from './parser.js';
import { buildIcs } from './ics-builder.js';

const OUTPUT = process.env.OUTPUT || 'public/schedule.ics';
const DEBUG_DIR = 'public/debug';

async function main() {
  console.log('[index] Starting schedule build...');
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  const weekTexts = await scrapeSchedule({ debugHtmlPath: `${DEBUG_DIR}/page.html` });
  console.log(`[index] Got ${weekTexts.length} week dumps`);

  await fs.mkdir(DEBUG_DIR, { recursive: true });
  for (let i = 0; i < weekTexts.length; i++) {
    await fs.writeFile(`${DEBUG_DIR}/week-${String(i + 1).padStart(2, '0')}.txt`, weekTexts[i] || '', 'utf8');
  }
  console.log(`[index] Saved debug dumps to ${DEBUG_DIR}/`);

  const events = parseAllWeeks(weekTexts);
  console.log(`[index] Parsed ${events.length} unique events`);

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

  if (events.length === 0) {
    const stub = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//rea-schedule-ics//stub//EN\r\nX-WR-CALNAME:РЭУ · расписание (парсер не нашёл событий)\r\nEND:VCALENDAR\r\n`;
    await fs.writeFile(OUTPUT, stub, 'utf8');
    console.warn('[index] WARNING: 0 events — wrote stub ICS. Check public/debug/week-*.txt');
    return;
  }

  const ics = await buildIcs(events);
  await fs.writeFile(OUTPUT, ics, 'utf8');
  console.log(`[index] Wrote ${OUTPUT} (${ics.length} bytes, ${events.length} events)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
