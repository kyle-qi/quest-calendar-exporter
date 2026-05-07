/*
 * Builds an RFC 5545 (.ics) calendar from the normalized event objects
 * produced by parser.js. Emits a single VEVENT per meeting with a
 * weekly RRULE so that calendar apps render the whole term cleanly.
 *
 * Public surface (attached to globalThis.QuestICS):
 *   buildICS(events, options) -> string
 */
(function (root) {
  'use strict';

  const DAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function pad(n, w) { w = w || 2; let s = String(n); while (s.length < w) s = '0' + s; return s; }

  function fmtLocalDateTime(date, time) {
    return (
      pad(date.y, 4) + pad(date.m) + pad(date.d) +
      'T' + pad(time.h) + pad(time.m) + '00'
    );
  }

  function fmtUTC(d) {
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  }

  function nowUTC() { return fmtUTC(new Date()); }

  function escapeICS(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // RFC 5545 says lines should be folded to 75 octets; we approximate by
  // characters since course data is ASCII in practice.
  function foldLine(line) {
    if (line.length <= 75) return line;
    const parts = [];
    let i = 0;
    while (i < line.length) {
      const chunk = line.substr(i, i === 0 ? 75 : 74);
      parts.push(i === 0 ? chunk : ' ' + chunk);
      i += i === 0 ? 75 : 74;
    }
    return parts.join('\r\n');
  }

  // Find the first concrete date >= startDate that falls on one of the BYDAY days.
  function firstOccurrence(startDate, byDays) {
    const want = byDays.map((d) => DAY_INDEX[d]).filter((n) => n !== undefined);
    const d = new Date(startDate.y, startDate.m - 1, startDate.d);
    for (let i = 0; i < 14; i++) {
      if (want.indexOf(d.getDay()) >= 0) {
        return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
      }
      d.setDate(d.getDate() + 1);
    }
    return startDate; // give up; degrade gracefully
  }

  // VTIMEZONE block for America/Toronto with current US/Canada DST rules.
  // This satisfies clients that strictly require an inline VTIMEZONE for
  // a TZID reference (Outlook in particular).
  function torontoVTimezone() {
    return [
      'BEGIN:VTIMEZONE',
      'TZID:America/Toronto',
      'X-LIC-LOCATION:America/Toronto',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'TZNAME:EDT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'TZNAME:EST',
      'DTSTART:19701101T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];
  }

  function uidFor(ev, idx) {
    const safe = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
    const parts = [
      safe(ev.subject) + safe(ev.number),
      safe(ev.section) || ('s' + idx),
      safe(ev.component) || 'CMP',
      safe(ev.classNbr) || ('n' + idx),
      ev.startDate.y + pad(ev.startDate.m) + pad(ev.startDate.d)
    ];
    return parts.join('-') + '@quest-calendar-exporter';
  }

  function buildVEvent(ev, idx, tz) {
    const first = firstOccurrence(ev.startDate, ev.days);
    const dtstart = fmtLocalDateTime(first, ev.startTime);
    const dtend = fmtLocalDateTime(first, ev.endTime);

    // UNTIL must be in UTC. Compute end-of-day for endDate in America/Toronto,
    // then convert to UTC. Using 23:59:59 in local time avoids missing the
    // last meeting when the local-to-UTC offset shifts the timestamp earlier.
    const localEnd = new Date(ev.endDate.y, ev.endDate.m - 1, ev.endDate.d, 23, 59, 59);
    const until = fmtUTC(localEnd);

    const summary = (ev.subject + ' ' + ev.number) +
      (ev.component ? ' ' + ev.component : '');

    const descriptionParts = [];
    if (ev.name) descriptionParts.push('Course: ' + ev.name);
    if (ev.section) descriptionParts.push('Section: ' + ev.section);
    if (ev.component) descriptionParts.push('Component: ' + ev.component);
    if (ev.classNbr) descriptionParts.push('Class Nbr: ' + ev.classNbr);
    if (ev.instructor) descriptionParts.push('Instructor: ' + ev.instructor);
    const description = descriptionParts.join('\n');

    const lines = [
      'BEGIN:VEVENT',
      'UID:' + uidFor(ev, idx),
      'DTSTAMP:' + nowUTC(),
      'SUMMARY:' + escapeICS(summary),
      description ? 'DESCRIPTION:' + escapeICS(description) : null,
      ev.room ? 'LOCATION:' + escapeICS(ev.room) : null,
      'DTSTART;TZID=' + tz + ':' + dtstart,
      'DTEND;TZID=' + tz + ':' + dtend,
      'RRULE:FREQ=WEEKLY;BYDAY=' + ev.days.join(',') + ';UNTIL=' + until,
      'END:VEVENT'
    ];
    return lines.filter(Boolean).map(foldLine);
  }

  function buildICS(events, options) {
    options = options || {};
    const tz = options.tz || 'America/Toronto';
    const calName = options.calendarName || 'uWaterloo Class Schedule';

    const out = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//quest-calendar-exporter//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeICS(calName),
      'X-WR-TIMEZONE:' + tz
    ];
    out.push.apply(out, torontoVTimezone());
    for (let i = 0; i < events.length; i++) {
      out.push.apply(out, buildVEvent(events[i], i, tz));
    }
    out.push('END:VCALENDAR');
    return out.join('\r\n') + '\r\n';
  }

  const api = { buildICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QuestICS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
