/*
 * Content script: runs on every Quest page (incl. nested iframes), watches
 * for the "My Class Schedule" list view, and injects a floating Download
 * button. Parsing and .ics generation live in parser.js / ical.js so the
 * same code is reused by the popup and the standalone web app.
 */
(function () {
  'use strict';

  if (window.__QuestExporterInjected) return;
  window.__QuestExporterInjected = true;

  const BTN_ID = 'qce-download-btn';
  const BTN_STYLE = [
    'position: fixed',
    'right: 20px',
    'bottom: 20px',
    'z-index: 2147483647',
    'padding: 10px 14px',
    'background: #fed136',
    'color: #1a1a1a',
    'border: 2px solid #b8860b',
    'border-radius: 8px',
    'font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'cursor: pointer',
    'box-shadow: 0 4px 14px rgba(0,0,0,0.25)'
  ].join(';');

  function downloadICS(events) {
    const ics = window.QuestICS.buildICS(events, {
      calendarName: 'uWaterloo Schedule'
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uw-schedule.ics';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function tryInject() {
    if (!window.QuestParser) return false;
    if (document.getElementById(BTN_ID)) return true;

    const events = window.QuestParser.parseQuestSchedule(document);
    if (!events || events.length === 0) return false;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Download .ics (' + events.length + ' meetings)';
    btn.style.cssText = BTN_STYLE;
    btn.addEventListener('click', () => {
      try {
        const fresh = window.QuestParser.parseQuestSchedule(document);
        downloadICS(fresh.length ? fresh : events);
      } catch (err) {
        console.error('[Quest Exporter]', err);
        alert('Failed to build .ics: ' + (err && err.message ? err.message : err));
      }
    });
    document.body.appendChild(btn);
    return true;
  }

  // Quest fetches schedule rows asynchronously, so retry while the page warms up.
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    let injected = false;
    try { injected = tryInject(); } catch (_) { /* swallow */ }
    if (injected || attempts >= 60) clearInterval(interval);
  }, 500);

  // Re-check after view-toggle clicks (e.g. List <-> Calendar).
  document.addEventListener('click', () => {
    setTimeout(() => { try { tryInject(); } catch (_) {} }, 800);
  }, true);
})();
