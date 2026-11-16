# Southlight: a clearer view of the next landing

A bright landing site can still lose sight of home. Southlight turns NASA lunar
terrain and Sun–Earth geometry into a mission you can explore: compare dates,
find time with sunlight and Earth in view together, and inspect the ridge or
eclipse behind each interruption.

## The problem

At the lunar south pole, low Sun angles make local terrain decisive. Sunlight
and Earth visibility vary separately. A promising sunlight figure can conceal
a window without direct Earth visibility. Planners, educators and the public
need an intuitive way to connect site, date, terrain and geometric visibility.

## Try one mission

Open Southlight and select **Try a mission**. At Connecting Ridge, a seven-day
window starting 1 January 2027 has 100% sampled sunlight but 0% Earth visibility.
Select **Find a better window**. Starting 10 January gives 100% sampled visibility
of both together: 168 more hours in the seven-day sample sequence.

The app preserves the original and recommended figures side by side. Date travel
accelerates from rest and slows at arrival, with an immediate cut for reduced
motion. Select a period on the shared Sun/Earth timeline to inspect the same
UTC moment in the Moon scene, terrain view and skyline. Text distinguishes
terrain obstruction from a geometric lunar eclipse.

The header's Scene time shows that moment. A separate Assessment window labels
the interval behind the totals and offers a window-start control. Inspecting a
calendar day changes the scene time while preserving the full window's totals.
Shared links restore both dates, site and view in new or already-open tabs.

These figures are model estimates using a half-disc visibility threshold and
30-minute steps, not a claim of uninterrupted observed conditions.

## NASA data and method

- NASA NAIF DE440/SPICE kernels supply Sun and Earth positions and lunar orientation.
- NASA GSFC LOLA terrain supplies the local skyline at three south-pole sites.
  Calculations use the 40 m map, with an 80 m sensitivity comparison.
- NASA's CGI Moon Kit supplies visualization textures; textures drive no metrics.
- Independent NASA/JPL Horizons direction checks, reference tests and measured
  terrain-resolution differences can be inspected in **How we know**.

The search considers daily UTC starts for up to 365 days. It maximizes simultaneous
Sun/Earth visibility, then sunlight, then shorter full darkness, then the earliest
date. Both terrain maps are searched independently; the app flags when their
preferred dates differ. It also flags sunlight-verdict disagreements for the
selected window. The date range is bounded by the prepared ephemeris.

## What makes Southlight useful

The figures, timeline and skyline share one engine and one selected moment.
An explanation accompanies each result, and the original window stays visible
beside a recommendation. Source links, validation and terrain sensitivity are
part of the result rather than a hidden appendix. Everything runs in the browser;
no account, API key or server-side calculation is required.

## Limits

Earth visibility is geometric line of sight, not a guarantee of radio service.
Sunlight visibility is not solar-array energy yield. Landing hazards, slopes,
thermal conditions, relays and flight safety are not assessed. Each site is one
point. A different location or terrain model can change the result. The 40/80 m
comparison is a sensitivity check, not ground truth or an error bound. Eclipse
geometry excludes atmospheric refraction and diffuse light. Good/Risky/Poor
are our sunlight thresholds, not NASA standards. All times are UTC.

## Public materials

- Interactive app: https://southlight-tau.vercel.app/
- Project guide and captioned walkthrough: https://southlight-tau.vercel.app/?guide=1
- Original screenshot: https://southlight-tau.vercel.app/submission/mission-original.jpg
- Comparison screenshot: https://southlight-tau.vercel.app/submission/mission-comparison.jpg
- Walkthrough: https://southlight-tau.vercel.app/submission/southlight-walkthrough.mp4
- English captions: https://southlight-tau.vercel.app/submission/walkthrough.vtt
- Transcript: https://southlight-tau.vercel.app/submission/walkthrough-transcript.txt

## Credits and AI use

Claude (Anthropic) and Codex (OpenAI) assisted with writing, debugging, testing
and reviewing the code. Screenshots and the walkthrough capture the running app.
The sky shader, palette and visual style were adapted from Voca, the team's
earlier project. Instrument Serif is licensed under the SIL Open Font License.
NASA data sources and software credits appear in the app's reference list.

Built for the NASA Space Apps Lunar Landing Site Navigator challenge. This is a
team project, not an official NASA mission-planning or landing-safety product.
