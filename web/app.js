/* Standalone web-app glue: read HTML from a file or textarea, parse with the
 * shared QuestParser, render a preview, and offer the .ics for download. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fileInput = $('file');
  const htmlInput = $('html');
  const parseBtn = $('parse');
  const dlBtn = $('download');
  const status = $('status');
  const previewWrap = $('preview-wrap');
  const previewBody = document.querySelector('#preview tbody');
  const countEl = $('count');

  let lastEvents = [];

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = cls || 'hint';
  }

  function fmtTime(t) {
    if (!t) return '';
    const h = ((t.h + 11) % 12) + 1;
    const ampm = t.h < 12 ? 'AM' : 'PM';
    return h + ':' + String(t.m).padStart(2, '0') + ' ' + ampm;
  }

  function fmtDate(d) {
    if (!d) return '';
    return String(d.m).padStart(2, '0') + '/' + String(d.d).padStart(2, '0') + '/' + d.y;
  }

  function renderPreview(events) {
    previewBody.innerHTML = '';
    for (const e of events) {
      const tr = document.createElement('tr');
      const cells = [
        e.subject + ' ' + e.number + (e.name ? ' &mdash; ' + e.name : ''),
        (e.component || '') + (e.section ? ' ' + e.section : ''),
        (e.days || []).join(' '),
        fmtTime(e.startTime) + ' - ' + fmtTime(e.endTime),
        fmtDate(e.startDate) + ' - ' + fmtDate(e.endDate),
        e.room || '',
        e.instructor || ''
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.innerHTML = c;
        tr.appendChild(td);
      }
      previewBody.appendChild(tr);
    }
    countEl.textContent = String(events.length);
    previewWrap.hidden = events.length === 0;
    previewWrap.open = events.length > 0;
  }

  function parseHTMLString(htmlString) {
    if (!htmlString || !htmlString.trim()) {
      throw new Error('Please upload a file or paste your schedule HTML.');
    }
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    const events = window.QuestParser.parseQuestSchedule(doc);
    return events;
  }

  parseBtn.addEventListener('click', () => {
    try {
      const events = parseHTMLString(htmlInput.value);
      lastEvents = events;
      if (events.length === 0) {
        setStatus(
          'No schedule rows recognized. Make sure the HTML is from My Class Schedule (List View).',
          'err'
        );
        renderPreview([]);
        dlBtn.disabled = true;
        return;
      }
      setStatus(
        'Parsed ' + events.length + ' meeting' + (events.length === 1 ? '' : 's') + '.',
        'ok'
      );
      renderPreview(events);
      dlBtn.disabled = false;
    } catch (err) {
      setStatus('Error: ' + (err && err.message ? err.message : err), 'err');
      dlBtn.disabled = true;
    }
  });

  dlBtn.addEventListener('click', () => {
    if (!lastEvents.length) return;
    const ics = window.QuestICS.buildICS(lastEvents, { calendarName: 'uWaterloo Schedule' });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uw-schedule.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      htmlInput.value = String(reader.result || '');
      parseBtn.click();
    };
    reader.onerror = () => setStatus('Could not read file: ' + reader.error, 'err');
    reader.readAsText(file);
  });
})();
