#!/usr/bin/env node
/* CLI: convert a saved Quest "My Class Schedule" HTML file into an .ics file.
 *
 * Usage:
 *   node bin/quest-ics.js <input.html> [output.ics]
 *   cat schedule.html | node bin/quest-ics.js - > schedule.ics
 */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('Missing dependency: jsdom. Run `npm install` first.');
  process.exit(2);
}

function loadShared() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const win = dom.window;
  for (const rel of ['../src/parser.js', '../src/ical.js']) {
    win.eval(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  }
  return win;
}

function readInput(arg) {
  if (!arg || arg === '-') {
    return fs.readFileSync(0, 'utf8');
  }
  return fs.readFileSync(arg, 'utf8');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write([
      'Usage: quest-ics <input.html> [output.ics]',
      '       cat schedule.html | quest-ics - > schedule.ics',
      '',
      'Reads a saved Quest "My Class Schedule" page (List View) and writes an',
      '.ics calendar file with weekly recurring events for each meeting.',
      ''
    ].join('\n'));
    return;
  }

  const inputPath = argv[0];
  const outputPath = argv[1];

  const html = readInput(inputPath);
  const sharedWin = loadShared();
  const inputDom = new JSDOM(html);
  const events = sharedWin.QuestParser.parseQuestSchedule(inputDom.window.document);

  if (events.length === 0) {
    console.error('No schedule meetings recognized. Did you save the List View of My Class Schedule?');
    process.exit(1);
  }

  const ics = sharedWin.QuestICS.buildICS(events, { calendarName: 'uWaterloo Schedule' });

  if (!outputPath || outputPath === '-') {
    process.stdout.write(ics);
  } else {
    fs.writeFileSync(outputPath, ics, 'utf8');
    console.error('Wrote ' + events.length + ' meeting(s) to ' + outputPath);
  }
}

main();
