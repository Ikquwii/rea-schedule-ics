import { createEvents } from 'ics';

export function buildIcs(events) {
  const icsEvents = events.map(ev => ({
    title: ev.subject,
    description: ev.type ? `${ev.type}${ev.location ? `\n${ev.location}` : ''}` : ev.location,
    location: ev.location || '',
    start: ev.start,
    end: ev.end,
    startInputType: 'local',
    startOutputType: 'local',
    calName: 'РЭУ · расписание Э07',
    categories: [ev.type || 'занятие'],
    alarms: [
      { action: 'display', description: 'Пара через 30 мин', trigger: { minutes: 30, before: true } },
    ],
  }));

  return new Promise((resolve, reject) => {
    createEvents(icsEvents, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}
