/*
 * Parses a uWaterloo Quest "My Class Schedule" page (List View) into a
 * normalized array of meeting events suitable for .ics generation.
 *
 * Quest is built on PeopleSoft Campus Solutions, so the schedule page
 * renders each enrolled course as a header followed by a "Class Meeting
 * Information" table. The columns vary slightly per term/release, so the
 * parser searches by header name rather than by column index.
 *
 * Public surface (attached to globalThis.QuestParser):
 *   parseQuestSchedule(rootDoc) -> Event[]
 *
 * Each Event has the shape:
 *   {
 *     subject, number, name,                  // course identity
 *     section, component, classNbr,           // section metadata
 *     days: ['MO','WE','FR'],                 // BYDAY codes
 *     startTime: { h, m }, endTime: { h, m }, // 24h local time
 *     startDate: { y, m, d },                 // first date the class runs
 *     endDate:   { y, m, d },                 // last  date the class runs
 *     room, instructor                        // free-text
 *   }
 */
(function (root) {
  'use strict';

  const COURSE_RE = /^([A-Z]{2,6})\s*(\d{3}[A-Z]?)\s*[-\u2013\u2014]\s*(.+)$/;
  const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP])M/i;
  const DAY_TIME_RE = new RegExp(
    '^([A-Za-z]+)\\s+(\\d{1,2}:\\d{2}\\s*[AP]M)\\s*[-\u2013\u2014]\\s*(\\d{1,2}:\\d{2}\\s*[AP]M)\\s*$',
    'i'
  );
  const DATE_RANGE_RE =
    /(\d{2})\/(\d{2})\/(\d{4})\s*[-\u2013\u2014]\s*(\d{2})\/(\d{2})\/(\d{4})/;

  const DAY_CODES = {
    Mo: 'MO', Tu: 'TU', We: 'WE', Th: 'TH', Fr: 'FR', Sa: 'SA', Su: 'SU',
    M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR'
  };

  function parseDays(raw) {
    const s = String(raw || '').replace(/\s+/g, '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const two = s.substr(i, 2);
      const one = s.substr(i, 1);
      if (DAY_CODES[two]) { out.push(DAY_CODES[two]); i += 2; }
      else if (DAY_CODES[one]) { out.push(DAY_CODES[one]); i += 1; }
      else { i += 1; }
    }
    // de-duplicate while preserving order
    return out.filter((d, idx) => out.indexOf(d) === idx);
  }

  function parseTime(raw) {
    const m = String(raw || '').match(TIME_RE);
    if (!m) return null;
    let h = +m[1];
    const min = +m[2];
    const isPM = m[3].toUpperCase() === 'P';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return { h, m: min };
  }

  function parseMeetingCell(daysTime) {
    if (!daysTime || /^TBA$/i.test(daysTime.trim())) return null;
    const m = daysTime.trim().match(DAY_TIME_RE);
    if (!m) return null;
    const days = parseDays(m[1]);
    if (days.length === 0) return null;
    const startTime = parseTime(m[2]);
    const endTime = parseTime(m[3]);
    if (!startTime || !endTime) return null;
    return { days, startTime, endTime };
  }

  function parseDateRange(text) {
    const m = String(text || '').match(DATE_RANGE_RE);
    if (!m) return null;
    return {
      startDate: { y: +m[3], m: +m[1], d: +m[2] },
      endDate:   { y: +m[6], m: +m[4], d: +m[5] }
    };
  }

  function cellText(td) {
    if (!td) return '';
    // Quest sometimes wraps content in nested spans/divs; collapse whitespace.
    return (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function findHeaderIndex(headers, candidates) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      for (const cand of candidates) {
        if (h.includes(cand)) return i;
      }
    }
    return -1;
  }

  function parseScheduleTable(table, course) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return [];

    const headers = Array.from(rows[0].querySelectorAll('th, td')).map((c) =>
      cellText(c).toLowerCase()
    );

    const colDays = findHeaderIndex(headers, ['days & times', 'days and times', 'days/times', 'day & time']);
    const colDates = findHeaderIndex(headers, ['start/end date', 'start / end date', 'start end date']);
    if (colDays < 0 || colDates < 0) return [];

    const colSection = findHeaderIndex(headers, ['section']);
    const colComponent = findHeaderIndex(headers, ['component']);
    const colRoom = findHeaderIndex(headers, ['room', 'location']);
    const colInstr = findHeaderIndex(headers, ['instructor']);
    const colClassNbr = findHeaderIndex(headers, ['class nbr', 'class #', 'class number']);

    const events = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td'));
      if (cells.length === 0) continue;

      const daysText = cellText(cells[colDays]);
      const datesText = cellText(cells[colDates]);
      const meeting = parseMeetingCell(daysText);
      const dates = parseDateRange(datesText);
      if (!meeting || !dates) continue;

      events.push({
        subject: course.subject,
        number: course.number,
        name: course.name,
        section: colSection >= 0 ? cellText(cells[colSection]) : '',
        component: colComponent >= 0 ? cellText(cells[colComponent]) : '',
        classNbr: colClassNbr >= 0 ? cellText(cells[colClassNbr]) : '',
        room: colRoom >= 0 ? cellText(cells[colRoom]) : '',
        instructor: colInstr >= 0 ? cellText(cells[colInstr]) : '',
        days: meeting.days,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        startDate: dates.startDate,
        endDate: dates.endDate
      });
    }

    return events;
  }

  function tryMatchCourse(text) {
    if (!text) return null;
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length > 120) return null;
    const m = t.match(COURSE_RE);
    if (!m) return null;
    return { subject: m[1], number: m[2], name: m[3].trim() };
  }

  // Walk the DOM in document order, tracking the most recently seen course
  // header so that any schedule table we encounter is associated with the
  // correct course.
  function parseQuestSchedule(rootDoc) {
    const root = rootDoc && (rootDoc.body || rootDoc.documentElement || rootDoc);
    if (!root) return [];

    const events = [];
    let currentCourse = null;
    const seenTables = new WeakSet();

    function visit(node) {
      if (!node) return;
      if (node.nodeType === 1 /* element */) {
        if (node.tagName === 'TABLE' && !seenTables.has(node) && currentCourse) {
          seenTables.add(node);
          const tableEvents = parseScheduleTable(node, currentCourse);
          if (tableEvents.length) events.push.apply(events, tableEvents);
        }

        // Quest puts course headers in span.PAGROUPDIVIDER (and similar
        // PeopleSoft container classes). Check the element's own short text
        // before recursing so we don't mistake row contents for a header.
        if (
          node.children.length === 0 ||
          /PAGROUPDIVIDER|PAGROUP|PSGROUPBOXLABEL|ps_box-group/i.test(node.className || '')
        ) {
          const candidate = tryMatchCourse(node.textContent || '');
          if (candidate) currentCourse = candidate;
        }
      } else if (node.nodeType === 3 /* text */) {
        const candidate = tryMatchCourse(node.textContent || '');
        if (candidate) currentCourse = candidate;
      }

      for (let c = node.firstChild; c; c = c.nextSibling) visit(c);
    }

    visit(root);

    // Fallback: if the structured walk found nothing (e.g. saved-page HTML
    // got rearranged), run a flat regex scan over plain text.
    if (events.length === 0) {
      events.push.apply(events, fallbackTextScan(root));
    }

    return events;
  }

  function fallbackTextScan(root) {
    const text = (root.innerText || root.textContent || '').replace(/\u00a0/g, ' ');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const events = [];
    let currentCourse = null;
    let pending = {};
    for (const line of lines) {
      const courseMatch = tryMatchCourse(line);
      if (courseMatch) { currentCourse = courseMatch; pending = {}; continue; }
      if (!currentCourse) continue;

      const meeting = parseMeetingCell(line);
      if (meeting) { pending.meeting = meeting; continue; }

      const dates = parseDateRange(line);
      if (dates && pending.meeting) {
        events.push({
          subject: currentCourse.subject,
          number: currentCourse.number,
          name: currentCourse.name,
          section: '', component: '', classNbr: '',
          room: '', instructor: '',
          days: pending.meeting.days,
          startTime: pending.meeting.startTime,
          endTime: pending.meeting.endTime,
          startDate: dates.startDate,
          endDate: dates.endDate
        });
        pending = {};
      }
    }
    return events;
  }

  const api = {
    parseQuestSchedule,
    parseDays,
    parseTime,
    parseMeetingCell,
    parseDateRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.QuestParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
