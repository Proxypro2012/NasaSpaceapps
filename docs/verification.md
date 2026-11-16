# Southlight verification — 15 November 2026

Public app: https://southlight-tau.vercel.app/

Public project guide: https://southlight-tau.vercel.app/?guide=1

## Results

- All 29 engine/state tests pass. Type checking, the production build and
  `git diff --check` pass.
- Real Google Chrome 149 browser checks passed against both the local
  production build and the anonymous public Vercel domain, at 375, 390, 768
  and 1280 pixels. No horizontal overflow or healthy-flow JavaScript errors.
- The mission starts Connecting Ridge on 1 January 2027 for seven days. The
  recommended start is 10 January. The table preserves original 100% sunlight /
  0% Earth visibility beside recommended 100% / 100%, with 168 extra sampled
  hours together. Repeated searches preserve the original snapshot.
- Sun/Earth timeline totals agree exactly with window metrics for 7, 14 and
  30 days. Selecting a blocked Earth period updates the shared cursor and skyline.
  Range-keyboard input advances the moment without changing the window start.
- The public March 3 eclipse example selects the 10:30–13:00 interruption,
  moves to 11:30 UTC, and explains the lunar eclipse in the skyline and text.
- Reduced motion, modal focus trapping, Escape, focus restoration, return to
  original, playback invalidation and post-briefing canvas sizing pass.
- The project guide, screenshots, project copy, captions and transcript return
  HTTP 200 without authentication. The H.264 walkthrough plays at 1280×800,
  lasts 29.6 seconds, has readable captions recorded into the picture, and
  provides a separate English caption track and transcript.
- Simulated data and texture failures produce explicit feedback; geometric
  results and the skyline remain usable when a visual texture fails.
- Development-only React tools are absent from production JavaScript.

## Review and quality limits

Date-navigation follow-up: the pill shows the displayed scene moment; a distinct
card control and range name the assessment window. Calendar selection changes
the moment without altering window totals. Real-Chrome tests cover same-tab
hash navigation without reload, fresh-tab restoration, browser back/forward,
malformed/out-of-range links, independent scene/window inputs, and navigation
while a search is pending. Playback is paused before a search captures its
inputs. A restoration version also cancels pending searches when an incoming
link uses an equivalent serialization of the same view. The independent review
found no actionable regressions in the first pass; the focused pass identified
this equivalent-link race and a stale loading-time briefing mask, both fixed and
covered by an additional state test and a delayed-load browser regression.
The final focused review confirmed both fixes and reported no findings.
Browser verification was performed separately in the main session.
The recording explicitly resets Whole Moon before the motion beat, and its
screenshots show the updated clock and range.

The first independent Codex review found stale playback comparisons, scene sizing
after mobile briefing dismissal, and missing media assets. All three were fixed
and verified in the browser. A final independent rerun hit the Codex CLI usage
limit. Direct code review, static analysis and live browser verification continued;
do not describe the unavailable rerun as a clean independent approval.

React Doctor reports no errors or performance-category findings. Its remaining
warnings concern custom dialogs (which have an exercised global focus trap and
inert background) and an existing non-component export in Calendar. React Scan
Lite captured commit events in the production build, but its fiber trees were
empty there, so no claim of zero unnecessary fiber renders is made.

The preceding mission build's three serial real-Chrome Lighthouse runs on the
public deployment gave the following baseline (not a new performance audit of
the date-navigation follow-up):

| Category | Desktop median | Throttled mobile median |
| --- | ---: | ---: |
| Performance | 100 | 93 |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 100 | 100 |

Mobile performance samples were 93, 96 and 93, with about 0.8 seconds for the
largest contentful paint and no layout shift. Initial calculation/rendering CPU
remains the performance follow-up; the frontend skill's all-category 100 target
has not been met on throttled mobile. The lit 3D scene and date motion were kept.

Current Cambridge-specific presentation length, review duration and any local
submission deadline remain unconfirmed; see `submission-requirements.md`.
Publishing this app does not submit the team project to the competition.

## All sites strip

The engine is unchanged. The strip consumes the existing per-site window metrics
and shares one settled-verdict map with the pins. Percentages use the same date
count-up; inspecting a scene moment preserves window totals. All nine row/pin
verdicts, dot colors and displayed percentages match the engine for these
30-day windows (UTC starts):

| Start | Connecting Ridge | Malapert Massif | Nobile Rim 1 |
| --- | --- | --- | --- |
| 15 Nov 2026 | Good · 100% sun · 50% Earth | Risky · 64% sun · 100% Earth | Poor · 61% sun · 44% Earth |
| 1 Jan 2027 | Good · 100% sun · 47% Earth | Poor · 56% sun · 100% Earth | Poor · 48% sun · 43% Earth |
| 1 Jun 2027 | Risky · 59% sun · 56% Earth | Poor · 40% sun · 100% Earth | Poor · 31% sun · 52% Earth |

Percentages are rounded for display; verdicts use unrounded engine values and
longest darkness. The normal-motion run checked 167 animation frames for row/pin
verdict agreement and confirmed intermediate count-up values. Pointer/keyboard
selection and repeated selection after Whole Moon reset focus the camera and
update the selected pin, card and row. Reduced motion cuts immediately.

The strip is 149px tall; the collapsed card measured 655px at 375px width,
593px at 768px, and 610px at 1280px in an 800px-high browser. The complete mission
card, including its hint, measures 696px, 615px and 689px respectively and has no
internal scrolling at these sizes. There is no horizontal
overflow or hidden row content. Skyline and evidence remain reachable through
the disclosure, whose summary flags terrain-sensitive verdicts. Existing mission,
navigation, responsive, dialog, loading and failure browser checks pass.
Chrome DevTools snapshot audits give accessibility, best practices and SEO 100
on desktop and mobile; these are not performance measurements. React Doctor
reports zero errors and no performance findings, with the same six existing warnings.

Code commit `057a210` is published at https://southlight-tau.vercel.app/.
Both browser-verification commands pass against that public build, including
all three dates, 153 sampled animation frames, the complete compact mission
card and the refreshed 29.6-second walkthrough. Public snapshot audits also
score 100 for accessibility, best practices and SEO on desktop and mobile.
The final independent code review reports no actionable regressions; its sandbox
could not launch Chrome, so all browser checks were run in the main session.

## Site comparison, Earth gap and month playback

The engine gains one metric, the longest Earth visibility gap: the longest run
of 30-minute samples with less than half of Earth's disc above terrain, clipped
to the window. It uses the same threshold as Earth visibility and mirrors the
longest-dark loop. The Python reference (`tools/lunar/metrics.py`) computes it
independently from SPICE. Rerunning `tools/build_golden.py` reproduces the
committed fixture byte for byte, and the TypeScript engine matches all 18
reference windows within 0.5 h. Spot values (7-day windows, UTC):

| Start | Connecting Ridge | Malapert Massif | Nobile Rim 1 |
| --- | --- | --- | --- |
| 1 Jan 2027 | 168 h (Earth 0%) | none (Earth 100%) | 168 h (Earth 0%) |
| 10 Jan 2027 | none (Earth 100%) | none (Earth 100%) | 10 h (Earth 94%) |

Unit tests cover the threshold boundary, clipping at both window edges, gaps
across midnight, and fully visible or hidden windows.

`npm run verify:comparison` passes at 375, 768 and 1280 px against the
production build: side-by-side table values on both dates, Sun/Earth/Both
calendar layers, CSV export, site selection from the table, and the guided
month (play, pause without drift, resume, replay, fixed totals, cancel on
navigation, reduced-motion cut). It now also fails if the comparison table is
clipped vertically; that bug (four of six rows hidden at desktop width) was
found by eye and fixed. Durations of whole days now read "7 days", not
"7.0 days". `verify:all-sites` and `verify:browser` still pass.

Code commit `9aa472c` is published at https://southlight-tau.vercel.app/.
All three browser-verification commands pass against that public build, and
the walkthrough video and screenshots were re-recorded from it.

## Window summary, Nearest PSR and longer presets

No existing metric changed. Two readouts are new: the line under the site name
(operable days and the first dark stretch of 48 h or longer) and Nearest PSR.

- **Summary line.** `src/engine/summary.ts` and an independent NumPy version in
  `tools/lunar/metrics.py` agree exactly on all 21 SPICE reference windows,
  including three new 29.5-day windows. Regenerating the fixture left every
  existing value byte-identical. Unit tests cover the half-day threshold, the
  half day at the end of a lunar-day window, a 47.5 h stretch that must not
  count, a stretch under way at the window start, and one cut off by the window end.
- **Nearest PSR.** `tools/fetch_psrs.py` parses the 164 south-pole rows of the
  LROC PSR Atlas into `public/data/psrs.json` unchanged. Distances are
  great-circle to each PSR's centre and match an independent vector calculation
  for every site and PSR: Connecting Ridge 15.5 km (SP_895060_2806850,
  de Gerlache / Shackleton), Malapert Massif 33.4 km (SP_860280_3443410),
  Nobile Rim 1 19.0 km (SP_853730_0452650, Nobile).
- **Presets and search.** Presets are 7, 14, 29.5, 30 and 365 days. The search
  now computes each 30-minute sample once and scores candidates from running
  totals. It returns results identical to the previous loop for every preset,
  near both ends of the data and for a site without a secondary map. A one-year
  search over 365 starts fell from about 5.5 s to 52 ms in Node (127 ms in the
  browser); the 30-day search fell from 0.4 s to 19 ms.

`npm run verify:psr` checks the summary line against the SPICE values on four
windows, PSR distances on the card, in Compare sites and in How we know, both
new presets and their links, the one-year search time and calendar, and that
the card fits without inner scrolling at 375, 768 and 1280 px. The other three
browser checks still pass, and the walkthrough and screenshots were re-recorded.

Code commit `2b98374` is published at https://southlight-tau.vercel.app/. All four
browser-verification commands pass against it; the one-year search took 139 ms there.

## Reproduce

Run `npm test`, `npm run build`, and `npm run preview`. Then run
`npm run verify:browser`. To check production, set
`APP_URL=https://southlight-tau.vercel.app` for the browser verification command.
`npm run verify:all-sites` reproduces the strip checks.
`npm run verify:comparison` reproduces the comparison, Earth-gap and month checks.
`npm run verify:psr` reproduces the summary-line, Nearest PSR and preset checks.
`node scripts/audit-mission.mjs` runs real-Chrome desktop/mobile Lighthouse audits.
Browser artifacts are written to the ignored `.playwright-mcp/` folder.
