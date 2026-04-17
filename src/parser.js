const DAY_NAMES = {
  'ПОНЕДЕЛЬНИК': 1,
  'ВТОРНИК': 2,
  'СРЕДА': 3,
  'ЧЕТВЕРГ': 4,
  'ПЯТНИЦА': 5,
  'СУББОТА': 6,
  'ВОСКРЕСЕНЬЕ': 0,
};

function parseDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('.');
  return { year: +y, month: +m, day: +d };
}

function parseTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m };
}

export function parseWeekText(text) {
  const events = [];
  const dayHeaderRegex = /(ПОНЕДЕЛЬНИК|ВТОРНИК|СРЕДА|ЧЕТВЕРГ|ПЯТНИЦА|СУББОТА|ВОСКРЕСЕНЬЕ),\s+(\d{2}\.\d{2}\.\d{4})/g;

  const dayBoundaries = [];
  let m;
  while ((m = dayHeaderRegex.exec(text)) !== null) {
    dayBoundaries.push({ dayName: m[1], date: m[2], index: m.index });
  }

  for (let i = 0; i < dayBoundaries.length; i++) {
    const { date, index } = dayBoundaries[i];
    const chunkEnd = i + 1 < dayBoundaries.length ? dayBoundaries[i + 1].index : text.length;
    const chunk = text.slice(index, chunkEnd);

    if (/Занятия отсутствуют/i.test(chunk)) continue;

    const pairRegex = /(\d+)\s*пара\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+([^\n]+(?:\n[^\n]+)*?)/g;
    const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);

    for (let li = 0; li < lines.length; li++) {
      const numMatch = lines[li].match(/^(\d+)\s*пара$/);
      if (!numMatch) continue;
      const pairNum = +numMatch[1];

      const timeStart = lines[li + 1];
      const timeEnd = lines[li + 2];
      if (!/^\d{2}:\d{2}$/.test(timeStart) || !/^\d{2}:\d{2}$/.test(timeEnd)) continue;

      const details = [];
      let di = li + 3;
      while (di < lines.length && !/^\d+\s*пара$/.test(lines[di])) {
        details.push(lines[di]);
        di++;
      }
      if (details.length < 2) continue;

      const subject = details[0];
      const type = details[1] || '';
      const location = details[2] || '';

      const { year, month, day } = parseDate(date);
      const s = parseTime(timeStart);
      const e = parseTime(timeEnd);

      events.push({
        pairNum,
        date,
        subject,
        type,
        location,
        start: [year, month, day, s.h, s.m],
        end: [year, month, day, e.h, e.m],
      });

      li = di - 1;
    }
  }

  return events;
}

export function parseAllWeeks(weekTexts) {
  const seen = new Set();
  const allEvents = [];
  for (const wt of weekTexts) {
    for (const ev of parseWeekText(wt)) {
      const key = `${ev.date}-${ev.pairNum}-${ev.subject}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allEvents.push(ev);
    }
  }
  return allEvents;
}
