# All sites strip

Approved by the user on 15 November 2026.

- [x] Add three compact rows from the existing per-site window metrics; share pin verdict timing and count-up motion.
- [x] Select and focus any site on row click, including the already-selected row.
- [x] Place the strip before a compact Skyline and details disclosure and check responsive fit.
- [x] Verify all site verdicts against pins on three dates, motion, selection and existing regressions; review and build.

All nine verdicts and percentages agree on 15 Nov 2026, 1 Jan 2027 and 1 Jun 2027
(30-day windows). Normal-motion checks sampled 167 frames with no row/pin
disagreement. All 29 unit tests, production build and existing browser checks
pass. Independent Codex review: no actionable regressions; browser checks were
run separately in the main session because the reviewer sandbox could not launch
Chrome. Engine files are unchanged.

Published code commit `057a210` to https://southlight-tau.vercel.app/ and pushed to
GitHub. Both browser verification commands pass on the public app; the public
motion run sampled 153 frames with no row/pin disagreement.
