# Southlight verification — 15 November 2026

Public app: https://southlight-tau.vercel.app/

Public project guide: https://southlight-tau.vercel.app/?guide=1

## Results

- All 25 engine/state tests pass. Type checking, the production build and
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

Three serial real-Chrome Lighthouse runs on the public deployment gave:

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

## Reproduce

Run `npm test`, `npm run build`, and `npm run preview`. Then run
`npm run verify:browser`. To check production, set
`APP_URL=https://southlight-tau.vercel.app` for the browser verification command.
`node scripts/audit-mission.mjs` runs real-Chrome desktop/mobile Lighthouse audits.
Browser artifacts are written to the ignored `.playwright-mcp/` folder.
