/* Minimal smoke test for parser.js + ical.js using jsdom.
 * Run with: npm test
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function loadShared() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const win = dom.window;
  // Bridge: parser/ical use globalThis; jsdom's window is the global there.
  const filesToLoad = ['../src/parser.js', '../src/ical.js'];
  for (const rel of filesToLoad) {
    const code = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    win.eval(code);
  }
  return win;
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ok  - ' + msg);
  } else {
    console.error('  FAIL - ' + msg);
    failures++;
  }
}

function run() {
  console.log('== Quest Calendar Exporter smoke test ==');
  const win = loadShared();
  const html = fs.readFileSync(path.join(__dirname, 'fixture-quest.html'), 'utf8');
  const fixtureDom = new JSDOM(html);
  const events = win.QuestParser.parseQuestSchedule(fixtureDom.window.document);

  console.log('Parsed ' + events.length + ' events.');
  for (const e of events) {
    console.log('  -', e.subject, e.number, e.component, e.section,
      '|', (e.days || []).join(''),
      e.startTime ? `${e.startTime.h}:${String(e.startTime.m).padStart(2,'0')}` : '',
      '-',
      e.endTime ? `${e.endTime.h}:${String(e.endTime.m).padStart(2,'0')}` : '',
      '|', e.room);
  }

  // Expectations
  assert(events.length === 3, 'three real meetings parsed (TBA row dropped)');

  const cs350Lec = events.find((e) => e.subject === 'CS' && e.component === 'LEC');
  assert(!!cs350Lec, 'CS 350 LEC found');
  assert(cs350Lec && cs350Lec.days.join(',') === 'MO,WE,FR', 'CS 350 LEC days = MO,WE,FR');
  assert(cs350Lec && cs350Lec.startTime.h === 13 && cs350Lec.startTime.m === 30, 'CS 350 LEC starts 13:30');
  assert(cs350Lec && cs350Lec.endTime.h === 14 && cs350Lec.endTime.m === 20, 'CS 350 LEC ends 14:20');
  assert(cs350Lec && cs350Lec.room === 'MC 4040', 'CS 350 LEC room MC 4040');
  assert(cs350Lec && cs350Lec.startDate.y === 2025 && cs350Lec.startDate.m === 1 && cs350Lec.startDate.d === 6, 'CS 350 LEC starts 2025-01-06');

  const cs350Tut = events.find((e) => e.subject === 'CS' && e.component === 'TUT');
  assert(!!cs350Tut, 'CS 350 TUT found');
  assert(cs350Tut && cs350Tut.days.join(',') === 'TH', 'CS 350 TUT days = TH');

  const math239 = events.find((e) => e.subject === 'MATH' && e.number === '239');
  assert(!!math239, 'MATH 239 found');
  assert(math239 && math239.days.join(',') === 'TU,TH', 'MATH 239 days = TU,TH');

  // ICS
  const ics = win.QuestICS.buildICS(events, { calendarName: 'Test Calendar' });
  assert(/BEGIN:VCALENDAR/.test(ics) && /END:VCALENDAR/.test(ics), 'ICS has VCALENDAR');
  assert(/BEGIN:VTIMEZONE/.test(ics), 'ICS has VTIMEZONE');
  assert((ics.match(/BEGIN:VEVENT/g) || []).length === 3, 'ICS has 3 VEVENTs');
  assert(/RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=2025040[45]T/.test(ics),
    'CS 350 LEC RRULE looks right');
  assert(/DTSTART;TZID=America\/Toronto:20250106T133000/.test(ics),
    'CS 350 LEC DTSTART localized');
  assert(/SUMMARY:CS 350 LEC 001/.test(ics), 'CS 350 LEC summary');
  assert(/LOCATION:MC 4040/.test(ics), 'CS 350 LEC location');

  if (failures) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run();
