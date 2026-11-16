# Scene date and shared-link corrections

Approved by the user on 15 November 2026.

- [x] Separate scene-time controls from the assessment-window control and range.
- [x] Apply in-tab hash and browser-history navigation atomically; preserve fresh-link behavior and validate bounds.
- [x] Add regressions for calendar inspection, independent controls, fresh/same-tab links and back/forward.
- [x] Explicitly reset the whole-Moon view for the recorded motion beat and refresh media.
- [x] Run all 29 tests, build, responsive browser checks and review. Final focused review: no findings.
- [x] Push and republish to Vercel; verify the public build at https://southlight-tau.vercel.app/.

Production code commit: 33aae3d. All four responsive browser runs passed on the
public domain, including in-tab navigation, fresh tabs, history and delayed-load
restoration. The November 30 example displays scene time 30 Nov 2026 12:00 UTC
beside the separately labeled 15 Nov–15 Dec assessment interval.
