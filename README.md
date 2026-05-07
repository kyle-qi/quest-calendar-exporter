# quest-calendar-exporter

Open-source replacement for the deprecated [uWaterloo Schedule Exporter](https://chromewebstore.google.com/detail/uwaterloo-schedule-export/epamhdpboimbcdgokgldffcdkfmbmajg)
Chrome extension. Converts your Quest **My Class Schedule** page into an
`.ics` calendar file you can import into Google Calendar, Apple Calendar,
or Outlook.

Three ways to use it, depending on what's most convenient:

| Mode             | When to use                                                                    |
|------------------|--------------------------------------------------------------------------------|
| Chrome extension | Easiest. One click while you're already logged in to Quest.                    |
| Standalone web   | Any browser. Drop in a saved Quest HTML page and download the `.ics`.          |
| Node CLI         | Scripts/automation: pipe a saved Quest HTML file through `quest-ics`.          |

All three share the same parser (`src/parser.js`) and `.ics` builder
(`src/ical.js`). Everything runs locally — your schedule is never uploaded.

---

## Option A — Chrome extension (recommended)

Drop-in replacement for the old extension.

### Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` (works in Edge/Brave/Arc/Opera too).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select this repository's root folder
   (the one containing `manifest.json`).

### Use

1. Sign in to [Quest](https://quest.pecs.uwaterloo.ca/).
2. Go to **Academics → Enroll → My Class Schedule** and pick the term.
3. Switch to **List View**.
4. A yellow **Download .ics (N meetings)** button appears bottom-right of
   the page. Click it. (Or click the extension's toolbar icon and use
   the popup's Download button.)
5. Import the downloaded `uw-schedule.ics` into your calendar app.

> The extension only requests host access to `quest.pecs.uwaterloo.ca`.

---

## Option B — Standalone web app

If you can't or don't want to install an extension (Safari, Firefox-only,
locked-down work machine, exporting an archived schedule, etc.):

1. Open the page (any modern browser):
   - Online: host `web/index.html` anywhere static (GitHub Pages, etc.), **or**
   - Locally: `open web/index.html` (macOS) / double-click the file.
2. In Quest, go to **My Class Schedule → List View**.
3. Save the page (`Cmd/Ctrl + S`, "HTML only" is fine), or right-click →
   "View Page Source" and copy/paste the HTML.
4. Upload the file (or paste the HTML) into the web app, click
   **Parse schedule**, then **Download .ics**.

---

## Option C — Node CLI

```bash
npm install
node bin/quest-ics.js path/to/saved-schedule.html schedule.ics
# or pipe via stdin
cat saved-schedule.html | node bin/quest-ics.js - > schedule.ics
```

After `npm install`, you can also run it via `npx quest-ics ...`.

---

## What gets exported

For every enrolled meeting (LEC/TUT/LAB/SEM/...) the tool emits a single
`VEVENT` with a `WEEKLY` `RRULE`, e.g.:

```
SUMMARY:CS 350 LEC 001
LOCATION:MC 4040
DTSTART;TZID=America/Toronto:20250106T133000
DTEND;TZID=America/Toronto:20250106T142000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20250405T065959Z
DESCRIPTION:Course: Operating Systems
 Section: 001
 Component: LEC
 Class Nbr: 5123
 Instructor: Solomon, Daniel
```

Notes:

- Time zone is `America/Toronto`, with a full inline `VTIMEZONE` block so
  Outlook is happy.
- Rows whose meeting time is `TBA` are skipped (there's nothing concrete
  to put on a calendar).
- Final exam dates aren't on the schedule list view in Quest, so they're
  not exported. Add them manually if needed.

---

## Development

```bash
npm install        # installs jsdom (used only for tests + CLI)
npm test           # runs the parser/ICS smoke test against a fixture
```

Project layout:

```
manifest.json          # Chrome MV3 manifest (extension lives at repo root)
src/
  parser.js            # Quest schedule HTML parser (shared)
  ical.js              # .ics builder (shared)
  content.js           # extension: floating Download button
  popup.html / popup.js
web/
  index.html           # standalone web app
  app.js
bin/
  quest-ics.js         # Node CLI
test/
  run.js               # smoke test
  fixture-quest.html   # synthetic schedule page
```

If Quest's HTML changes shape and the parser misses meetings, the
fallback regex scan in `parser.js` (`fallbackTextScan`) should still
catch them. Open an issue (or a PR with an updated fixture) if you spot
a regression.
