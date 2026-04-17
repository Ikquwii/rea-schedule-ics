import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapeSchedule } from './scraper.js';
import { parseAllWeeks } from './parser.js';
import { buildIcs } from './ics-builder.js';

const OUTPUT = process.env.OUTPUT || 'public/schedule.ics';

async function main() {
  console.log('[index] Starting schedule build...');
  const weekTexts = await scrapeSchedule();
  console.log(`[index] Got ${weekTexts.length} week dumps`);

  const events = parseAllWeeks(weekTexts);
  console.log(`[index] Parsed ${events.length} unique events`);

  if (events.length === 0) {
    console.error('[index] No events parsed — check selectors or parser regex!');
    process.exit(1);
  }

  const ics = await buildIcs(events);
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, ics, 'utf8');
  console.log(`[index] Wrote ${OUTPUT} (${ics.length} bytes, ${events.length} events)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
