Lunar Landing Site Navigator: build plan
Nov 14, 2026 · @Kabir Tiwari
Goal and win strategy
We are building a landing-site planner for the Moon's south pole: pick a date and it tells a mission planner, site by site, whether a lander gets sunlight and a line of sight to Earth. It answers the official challenge Lunar Landing Site Navigator, which asks for an intuitive tool to compare landing sites and dates and to show the Sun and Earth relative to the horizon, for power and direct-to-Earth communication windows.
The win thesis: most teams will build a pretty Moon with a light on it. We return a verdict with checked numbers, in a distinctive look.
Judging criterion
What we show
Influence
Verdict per site and date (sunlight %, longest dark stretch, Earth-link %), a best-window finder, shareable results
Creativity
One date drives a textured 3D Moon, the Sun, Earth, and site pins, all gliding to their real positions
Validity
Terrain-aware calculation, a trust panel listing assumptions, and a check against published values
Relevance
Maps one-to-one onto the challenge text: compare sites and dates, horizon view, power and comms windows
Presentation
A planner-story demo, a short video, a clean write-up. Presentation counts as much as the other four
Hard rules from the Judging and Awards Guide: respond to an official challenge (Create Your Own is not eligible for Global Judging), list every external resource under References, and every teammate must be registered, have a Local Event, and appear on the team's Members tab.
Scope
Ship a correct engine, the verdict, the calendar, and the horizon view first; everything else is a bonus we cut without guilt.
Tier
Feature
Done when
Must
Sun and Earth direction in the local sky at a site, for any date in range
Output matches an independent calculation for 3 test dates
Must
Terrain horizon for each of 3 sites from real elevation data
A skyline plot per site; Sun and Earth tests use it
Must
Main screen: textured Moon, Sun, Earth, 3 site pins colored by verdict
Changing the date moves everything and recolors the pins
Must
Verdict panel: sunlight %, longest dark stretch, Earth-link %
Numbers recompute for the chosen date window
Must
Calendar heatmap: 3 sites by 30 days
One glance shows the best days
Must
Horizon view: skyline with Sun and Earth tracks
Scrubbing the date moves both markers
Must
Trust panel: assumptions plus validation result
Every threshold and data source is listed on screen
Must
Submission package
Video, write-up, References, project page submitted
Should
Best-window finder per site
One button jumps to the top-scoring window
Should
Dive view: 3D terrain around a site with real shading
Shadows sweep as the date moves
Should
Shareable link and one-page export
A link reopens the same date and site; CSV downloads
Should
Planner / Educator / Public toggle
Same data in numbers, plain words, or time-lapse
Could
Natural-language query (AI turns the question into settings; numbers still come from the engine)
Only if everything above is done by Sunday 12:00
Won't build: arbitrary map clicks beyond the 3 sites, rover routes, temperature or terrain-safety scoring, multi-year statistics, accounts, a backend database, a phone app.
The verdict thresholds (what counts as Good, Risky, Poor) are our own definitions, not NASA standards. We show them on screen and say so.
Architecture
One direction only: the date goes into the engine, the engine writes numbers, and the screens draw them. Keeping it one-way is what lets the engine and the screens be built in parallel.
Changing the date re-asks the engine on every frame of the animation; the screens never calculate anything themselves.
Data sources and calculation spec
Everything we show comes from two public inputs: NASA's planet and Moon position files, and NASA's laser-altimeter map of the lunar south pole. Nothing here needs an account or an API key, but the files are large, so start the downloads first.
Input
File
Size
Used for
Planet positions
de440s.bsp (spk/planets)
31 MB
Sun and Earth relative to the Moon. The full de440.bsp (114 MB) is only needed for very long date ranges
Moon orientation
moon_pa_de440_200625.bpc (pck)
12 MB
Which way the Moon faces on a given date
Moon frame definition
moon_de440_250416.tf (fk/satellites)
small
Required alongside the orientation file
Leap seconds
naif0012.tls (lsk)
5 KB
Converting calendar dates to ephemeris time
Terrain, fast path
LDEM_80S_80MPP_ADJ.TIF
181 MB
First working horizon masks; use this one first
Terrain, better
LDEM_80S_40MPP_ADJ.TIF (685 MB), or 20MPP (2.6 GB)

Swap in once the pipeline works
Moon texture
NASA CGI Moon Kit color map plus displacement map

The hero 3D Moon. NASA says it is optimized for aesthetics, not science
The terrain files are cloud-optimized GeoTIFFs in south polar stereographic meters, in the Moon's mean-Earth frame. Use the 80 m file at the start: it loads in seconds, and the 20 m file would hide a bug behind a long wait.
Calculation, in order
1.  Convert the chosen date and time to ephemeris time with the leap-second file.
2.  For a site at latitude and longitude, get the Sun and Earth direction in the Moon-fixed frame (spiceypy, frame MOON_ME or MOON_PA). Rotate to the site's local east, north, up frame. This gives azimuth and elevation for each.
3.  Build the site's horizon mask from the terrain: for each of 360 azimuths, the highest angle at which terrain blocks the sky, scanning outward to about 100 km, including the site's own height above the surrounding ground.
4.  Treat the Sun as a disc about 0.53 degrees wide and Earth as a disc about 2 degrees wide. Visible fraction is the part of the disc above the mask, so rises and sets are gradual, not on-off.
5.  Step through the chosen window every 30 minutes (or finer near rises and sets) and count.
Numbers on the verdict panel
• Sunlight %: share of steps with the Sun at least half visible.
• Longest dark stretch: longest run of steps with the Sun fully hidden, in hours.
• Earth-link %: share of steps with Earth at least half visible. This is line of sight only; it is not a link budget.
• Combined: share of steps with both.
Verdict rules (our definitions): Good needs sunlight of at least 70% and longest dark stretch under 48 hours; Poor is sunlight under 40% or a dark stretch over 120 hours; everything else is Risky. Treat these three numbers as placeholders until we sanity-check them against the benchmark below, and print them on the trust panel.
Benchmark for validation: a JPL study using radar-derived terrain reported its best proposed south-pole base site at about 92% yearly solar availability and about 50% direct-to-Earth availability. Our numbers will not match to the digit, since the sites and models differ; we should land in the same neighborhood and say so.
Not yet verified, check before relying on them
• Which of the Moon frame files (moon_de440 versus the older ones) pairs with the orientation file we download; read the header of each.
• Whether the challenge page links its own datasets or sites; use those first if it does.
• The license and credit line for the Moon Kit textures and any fonts we reuse from Voca; list all of it in References.
• The three candidate sites: pick them from published Artemis candidate regions, and record the source for each coordinate.
Screens and interactions
The app is one main screen with two ways to zoom in, so a judge can understand it in ten seconds and keep exploring for ten minutes.
Screen
What the user sees
What they can do
Data behind it
Main (hero)
Grainy textured Moon on the navy-to-mauve night gradient, Sun as a glow behind or beside it lighting one side, Earth as a small disc, 3 pins colored Good / Risky / Poor, date field at the top, verdict card
Pick a date; click a pin; press Jump to best window
Engine output for the chosen date and window
Site dive
Close-up of the south pole with the chosen site, terrain lit by the real Sun direction, skyline strip with Sun and Earth markers
Scrub time within the day; step days; go back
Horizon mask plus Sun and Earth direction per step
Calendar
Heatmap: 3 sites by 30 days, colored by combined sunlight and Earth-link
Click a cell to set the date and site
Precomputed metrics per site per day
Trust panel
Assumptions, thresholds, data files and versions, benchmark comparison
Open and close; copy the citation list
Static text plus the validation result
The date change, step by step
• The date field accepts typing, arrows, and a drag scrubber.
• On change, we animate the date value itself from old to new over about 1.2 seconds with a cubic-bezier ease (for example 0.22, 1, 0.36, 1). Every frame we recompute Sun direction, Earth direction, Moon phase shading, and pin colors from the engine for that in-between date. We do not slide objects along a straight curve, because the Sun and Earth follow real paths and a faked path would be wrong.
• Numbers on the verdict card count up to their new values over the same time, so the eye follows the change.
• Pins recolor at the end of the move, with a brief pulse on any that changed verdict.
Details that matter
• Default date is today (Nov 14, 2026), default window 30 days, so the first screen already has an answer.
• Every number has a one-line plain-language caption (for example: Sun is up for 83% of this window).
• Keyboard: left and right arrows step one day; Enter on a pin opens the dive.
• Respect reduced motion: skip the animation and cut straight to the new state.
• Loading: show the Moon immediately and the verdict numbers as soon as the engine responds; precompute the heatmap and the three sites' default windows at build time so the first paint is instant.
• Phone: a single column, with the Moon on top and the verdict card below. Judges may open it on a laptop, so the laptop layout comes first.
Art-style rules
• Style the shell (background, type, the Moon's grain, the glow, the teal pill button) and keep every data layer crisp: the heatmap, skyline, numbers, and verdict colors are flat and high-contrast.
• Verdict colors must not clash with the teal controls: keep controls in the teal family and use a separate green, amber, and red for Good, Risky, Poor, each with a text label so color is never the only signal.
• The Moon's lit side must be driven by the real Sun direction, so the pretty picture is also the correct picture.
• Pre-render the grain as a texture rather than a live filter, to keep the frame rate smooth.
• Reusing Voca assets or fonts is fine if they are ours; list them in References.
Team roles and handoffs
Three people, three lanes, and one contract between them: the engine returns a plain data file, and the screen reads it. That contract is what lets everyone work in parallel from the first hour.
Person
Owns
Hands to others
Done when
You (front end and art)
Main screen, Moon scene, date animation, site dive, calendar, trust panel layout, art pass, demo polish
Final screens and a recorded demo path to Teammate 3
The whole demo path runs without touching code
Teammate 2 (engine)
Kernel setup, Sun and Earth direction, horizon masks from the terrain, metrics, verdicts, heatmap data, benchmark check
A data file and a function with the agreed fields (below)
Output matches an independent check on 3 test dates
Teammate 3 (story and submission)
Written description, References list, pitch and 3-minute video, project page, final submission, deadline watch
Questions about what the data means; a punch list for you
Submission confirmed on the project page before the deadline
The contract (agree in the first hour)
For a site and a date window, the engine returns, per time step: time, Sun azimuth and elevation, Sun visible fraction, Earth azimuth and elevation, Earth visible fraction. And per window: sunlight %, longest dark stretch (hours), Earth-link %, combined %, verdict. A JSON file with fake but correctly shaped values goes up in hour one, so you can build the screens against it while the real engine is still being written.
Handoffs and checkpoints
• Hour 1: contract agreed, mock JSON committed, shared folder and repo set up, everyone registered on the project page.
• Hour 2 to 3: Teammate 2 confirms real Sun and Earth positions are coming out of the kernels. This is the go/no-go for the whole plan (see Risks).
• Each evening and midday: a 10-minute sync where the engine output is dropped into the real screens, so mismatches surface early.
• Teammate 3 writes from the data as it firms up, and asks Teammate 2 for the two or three sentences on method that must be exactly right.
If someone is stuck: say so within 30 minutes. The first call is to swap tasks, not to push harder; the second is to cut a Should feature.
Timeline
We have about 29 hours from now to the assumed deadline, with one night in the middle, so the plan is five phases and three gates.
Anything beyond the Must list starts only after the Sunday 12:00 cut line; the Saturday gate decides whether we continue with this challenge at all. The 18:00 deadline is an assumption until we confirm it.
Validation plan
Validity is a judging criterion, so we prove the numbers are right before we polish anything, and we show the proof on screen.
Check
How
Pass looks like
Sun and Earth directions
Compare our azimuth and elevation at the 3 sites on 3 dates against an independent source: NASA's Horizons service, or a second SPICE call in a different frame
Agree within about 0.1 degree
Sun elevation range
At the south-pole sites the Sun should stay low: NASA's Artemis material says it stays below about 7 degrees at potential landing regions
Max elevation in that range, never high overhead
Day length sanity
Count how long the Sun is up at a site over one lunar day (about 29.5 Earth days)
The pattern repeats on roughly that period
Horizon mask
Plot the skyline for one site and compare it by eye against the terrain image
Peaks line up with the ridges in the map
Yearly totals vs published
Run one site for a full year and compare with the JPL study (about 92% solar, about 50% direct-to-Earth for its best site)
Same neighborhood, with the differences explained
Resolution sensitivity
Re-run one site with the 80 m and the 40 m terrain
Verdict does not flip; if it does, say so on the trust panel
Disc vs point
Compare verdicts with the Sun as a point and as a disc
We know how much the disc matters
What we state openly on the trust panel
• Line of sight only: Earth visible does not guarantee a working link.
• The verdict thresholds are ours.
• Terrain resolution and which files and versions were used.
• Which dates are covered; outside the range the app says so instead of guessing.
• The 3D Moon texture is for looks and does not drive any number.
Who checks: Teammate 2 runs the checks and writes each result in one line; Teammate 3 turns them into the Validity paragraph of the write-up. A failed check is not a crisis on Saturday night; it is a bug to find while there is still time.
Do not do: tune the thresholds until the benchmark matches. Set them first, compare, and report the gap.
Submission checklist and 3-minute demo script
Submission opens today at 9:00 a.m. local time, and we should submit early with the video already uploaded, not at the last minute. The exact deadline depends on the Team Owner's Local Event, so confirm it with the organizers today; this plan assumes about 18:00 on Sunday.
Checklist
• All three members registered with the same Local Event and listed on the project page's Members tab.
• Challenge selected: Lunar Landing Site Navigator (not Create Your Own, which is ineligible for Global Judging).
• Project title and a short description that names the problem, the users, and what the tool returns.
• Demo video (3 minutes or less), uploaded and playable while logged out; English subtitles if any narration is not in English.
• Link to the working app, tested on a clean browser and on the venue Wi-Fi.
• Link to the code repository, public, with a README that says how to run it and where each data file comes from.
• References field: every external resource, including NASA kernels, the LOLA terrain, the Moon Kit textures, libraries, fonts, and any AI tool used.
• Written write-up: problem, method, validation result, limits, what is next.
• Pre-existing work disclosed: the Voca art style and any assets we reuse. Check the rules wording and say plainly what was built this weekend.
• Final submit pressed, then re-opened the project page to confirm it shows as submitted.
• A backup: a screen recording and a static export of the app in case the live link fails during judging.
Demo script (about 3 minutes)
Time
On screen
Say
0:00 to 0:20
The Moon, glowing, slowly turning
The question every landing team asks: where and when can we land and still have power and a link home? Today that takes weeks of specialist work.
0:20 to 0:50
Change the date; Sun and Earth glide, pins recolor
Pick any date. The Sun and Earth move to their real positions, and every site gets a verdict.
0:50 to 1:30
Click a Good pin; verdict card counts up; open the skyline
This site gets sunlight for most of the window and has a clear line to Earth for about half. Here is the skyline that decides it, built from real lunar terrain.
1:30 to 2:00
Open the calendar heatmap; press Jump to best window
One view of every day for every site. One click finds the best window.
2:00 to 2:30
Open the trust panel
We checked our numbers against NASA's own data and against a published study. Here are the checks and the limits.
2:30 to 3:00
Switch to Educator, then Public view; end on the Moon
The same engine serves a mission planner, a classroom, and anyone curious.
Video rules for us: record the screen at a steady pace, add subtitles, keep the voice calm and the numbers large, and rehearse once end to end before recording. Record the demo path with the real engine, not with the mock file.
Risks, fallbacks, and the switch trigger
The biggest risk is not the art or the 3D; it is the engine not producing trustworthy Sun and Earth numbers in time. So the plan front-loads that test and has a pre-agreed exit.
Risk
How likely
What we do
Kernels or terrain files will not download or load (network limits, size)
Medium
Start downloads in hour one; use the 31 MB planet file and the 80 m terrain; ask a teammate to download on a different network; if terrain fails, fall back to a smooth-Moon model and say so
Moon frame setup is wrong (wrong frame file for the orientation file)
Medium
Check against Horizons on one date in the first 3 hours; read the kernel headers; try MOON_ME if MOON_PA misbehaves
Horizon mask is slow or buggy
Medium
Precompute at build time; use 80 m first; cut angular resolution to 2 degrees if needed
Numbers disagree with the benchmark
Medium
Report the gap and the reason; do not tune to match
3D Moon is heavy and stutters
Medium
Pre-render grain, cap texture size, drop shadows to a simple terminator if needed
Art style fights the data (muddy colors)
Low
Keep data layers flat and crisp; test the heatmap on the real background early
Scope creep
High
Should items start only after every Must is done; one person owns the cut list
Someone is unavailable or stuck
Medium
Roles swap by the 30-minute rule; Teammate 3 can cover simple front-end tasks
Submission problems (deadline misread, video upload fails, members not registered)
Medium
Confirm the deadline today; upload the video early; test the logged-out view
Licensing or credit gaps (textures, fonts, libraries)
Low
List every external item in References as it is added
Judges cannot run the app
Low
Hosted link plus a screen-recorded backup in the video
The switch trigger
If by about 15:00 today (roughly 90 minutes after the engine starts) real Sun and Earth positions are not flowing from the kernels at one site and one date, we stop and switch to the astronaut health challenge: a crew health copilot that works through a communication blackout. Both challenges were judged to be buildable in a weekend; this one is the safer fallback if the data setup goes wrong. Make the call at the checkpoint, out loud, without debate. After 15:00 the switch is not realistic.
Fallbacks that keep the demo alive
• If terrain fails but the planet positions work: show sunlight and Earth direction with a flat horizon and label it a first-order estimate.
• If the live app fails: play the recorded demo and show the static export.
• If time runs short on Sunday: ship the Must list only, spend the last two hours on the video and the trust panel, not on new features.
Facts still unverified
• The exact submission deadline for our Local Event.
• Whether the challenge provides its own datasets or candidate sites.
• How the rules treat pre-existing work such as the Voca style and assets.