/* Popup: queries the active tab's content-script world for parsed events,
 * then builds the .ics in the popup context and triggers a download. */
(function () {
  'use strict';

  const dl = document.getElementById('dl');
  const status = document.getElementById('status');

  function setStatus(text, cls) {
    status.textContent = text;
    status.className = cls || 'hint';
  }

  function dedupe(events) {
    const seen = new Set();
    return events.filter((e) => {
      const key = [
        e.subject, e.number, e.component, e.section, e.classNbr,
        e.startDate && e.startDate.y, e.startDate && e.startDate.m, e.startDate && e.startDate.d,
        e.startTime && e.startTime.h, e.startTime && e.startTime.m,
        (e.days || []).join(',')
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function getEvents() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () =>
        (typeof window !== 'undefined' && window.QuestParser)
          ? window.QuestParser.parseQuestSchedule(document)
          : []
    });
    const all = [];
    for (const r of (results || [])) {
      if (r && Array.isArray(r.result)) all.push.apply(all, r.result);
    }
    return dedupe(all);
  }

  async function refresh() {
    try {
      const events = await getEvents();
      if (events.length === 0) {
        setStatus('No schedule rows detected. Make sure you are on My Class Schedule in List View.', 'err');
        dl.disabled = true;
        return;
      }
      setStatus('Found ' + events.length + ' meeting' + (events.length === 1 ? '' : 's') + '.', 'ok');
      dl.disabled = false;
    } catch (err) {
      setStatus('Error: ' + (err && err.message ? err.message : err), 'err');
      dl.disabled = true;
    }
  }

  dl.addEventListener('click', async () => {
    try {
      const events = await getEvents();
      if (!events.length) return;
      const ics = window.QuestICS.buildICS(events, { calendarName: 'uWaterloo Schedule' });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url,
        filename: 'uw-schedule.ics',
        saveAs: true
      });
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setStatus('Download failed: ' + (err && err.message ? err.message : err), 'err');
    }
  });

  refresh();
})();
