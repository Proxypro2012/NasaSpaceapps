# Southlight design system

## 1. Atmosphere and identity
Preserve the existing lunar scene: a lit, textured Moon over a navy and mauve sky,
with dark translucent instrument panels and warm editorial typography.

## 2. Color
Use the existing CSS tokens: --night and --navy for the sky, --panel and --sheet
for surfaces, --cream for text, --line for dividers, --ocean and --sea-glass for
controls, --gold for sunlight. Reserve --good, --risky and --poor for labeled
conditions. Resolution sensitivity uses --risky with an explicit text explanation.

## 3. Typography
--serif (Instrument Serif) supplies the wordmark and site headings. --sans supplies
controls and data. Retain the existing 15px body, 14px controls, 12–13px captions,
28px mobile numerals and responsive desktop numerals. Data uses tabular figures.

## 4. Spacing and layout
Reuse --gutter (20px), --card-w (380px), existing 4/8/12/16/20px spacing and the
1079px single-column breakpoint. The mission experience expands --card-w to
440px, with 480px reserved beside the Moon. Desktop keeps the verdict beside the Moon.
Phone menus open 8px beneath their trigger, fit the visible viewport with 16px
side clearance and a 360px maximum width, and scroll vertically with 20px bottom
clearance if needed; controls must remain reachable at 375, 390 and 768px.

## 5. Components and states
- Pill and round buttons: existing normal, hover, focus-visible and pressed
  treatments; accessible names and native keyboard activation.
- VerdictBadge: Good/Risky/Poor with word and glyph. It describes sunlight
  conditions, never landing safety or radio-link viability.
- VerdictCard: planner figures, educator explanation and public summary use the
  same engine output. A resolution note names both models and any disagreement.
- HorizonChart: retain the skyline and paths; distinguish terrain obstruction
  from an eclipse in visible text and accessible descriptions.
- Sheets: existing title, close button and Escape behavior. Trust content states
  methods, measured uncertainty and the scope of validation.
- Menu: accessible window/view choices; no offscreen controls at narrow widths.
- Loading/error states: retain explicit startup and terrain-load feedback.

## 6. Motion
Date travel starts at rest, accelerates and decelerates without overshoot. Use a
quintic smoothstep (zero speed and acceleration at both ends). Ordinary travel
and count-up last 1.2s; best-window jumps use 1.8–3.6s according to distance.
Scene and counters share the jump duration. A new action cancels the previous
trajectory from the currently displayed moment. Reduced motion cuts immediately.

## 7. Accessibility and accepted limits
Keep visible focus, semantic controls, text verdicts, UTC labels and reduced-motion
support. The rendered Moon and stretched terrain are orientation aids, not energy
or safety estimates. Primary calculations use 40m terrain; comparison with 80m
terrain is a sensitivity check, not an uncertainty bound or ground truth.

## Mission and evidence experience
The opening is a mission briefing over the existing lit Moon, with a large
Instrument Serif heading and one teal action. It loads Connecting Ridge,
1 January 2027, midnight UTC, for seven days. Shared links bypass the briefing.
The briefing can be dismissed and restarted from the menu.

New primitives follow the existing panel, sheet, pill and link treatments:
- MissionBriefing: eyebrow (12px), display heading (36px mobile, 44px desktop),
  body (15px), primary Try a mission and secondary Explore freely actions.
- MissionComparison: a semantic table with Original / Recommended columns,
  UTC start dates, sunlight, Earth visibility, together, and longest darkness.
  Original values never animate. Recommendation values are exact and labeled
  as the destination during date travel. A status sentence explains the delta.
  A return action restores the original window. Site, window or date edits clear
  the snapshot; selecting a moment or changing audience preserves it.
- VisibilityTimeline: two aligned 32px strips, gold for sunlight and sea-glass
  for Earth visibility. Unavailable terrain segments use --navy and hatching;
  eclipse segments use --risky with a distinct crosshatch. Text and accessible
  labels name every cause. Selecting a segment or the shared range cursor
  sets the same UTC moment used by the Moon, skyline and site view.
- EvidenceSummary: 12px source links, current terrain comparison, 30-minute
  sampling, validation status, and explicit line-of-sight / safety limits.
- SubmissionSheet: project opening, real screenshots, a captioned screen
  recording, and links to the interactive mission and scientific evidence.
  Loading/error feedback, native media controls, captions and poster are required.

Use the existing 4px spacing rhythm, 12/14/15px text, 20px panel padding and
16/20px responsive gutters. New panel surfaces use the same tint, blur, rim and
warm text, never a separate card theme. Comparison columns remain side by side
at 375px, with wrapping labels. The mobile briefing sits above the Moon with
enough scene height to keep both readable. Keyboard focus must remain in an
open modal and return to its trigger; the background is inert. All data uses
UTC and tabular figures. Motion keeps the existing quintic date acceleration.

The briefing renders while NASA data loads, with its mission action disabled
until calculations are ready. Its heading remains mounted to avoid layout
movement. Three.js view code is fetched separately and in parallel with data.
View loading and failures are explicit; geometric results and the skyline remain
available if a visual asset fails. Canvas size changes are observed after layout.
Timeline strips clip their cursor's empty translated bounds; the actual data
segments retain their full proportions, with larger interruption controls below.

## Scene clock and assessment window
The header date pill names Scene time and shows the actual displayed UTC date
and clock time, including during date travel. Its picker, arrows and drag inspect
moments inside the current assessment window. The picker is disabled during
travel; the timeline can interrupt travel. Use 12px labels, 17px date numerals,
and the existing pill surface, focus ring and 1.2-second ordinary date motion.

The result card names its full assessment interval and has a visible Window
start date input. These controls shift the window and recompute totals. Calendar
and timeline selections retain that interval and its totals, with this behavior
explained beside the range. Inputs remain reachable at 375px; the mobile
briefing moves to 216px to clear the two-line scene-clock pill.

Shared links restore the window, moment, site and audience atomically on first
load, hash changes and browser history navigation. Invalid values are ignored or
bounded using the same rules as initial load. URL writes must never overwrite an
incoming navigation or create a history loop. External navigation cuts to its
saved moment and stops playback. Record the Sun/Earth motion beat in the
whole-Moon view, explicitly resetting the camera before the beat.
