# Southlight public launch

React/Vite static app. No backend, account system, database or API secrets.
The agent can complete deployment and public verification; the team submits to
NASA Space Apps using its own registered team page.

- [ ] Agent: run the full tests and production build; review the changes.
  Worked when engine regressions pass and `dist/` builds without type errors.
- [ ] Agent: inspect the mission at phone, tablet and desktop sizes, including
  keyboard input, reduced motion, data failures and terrain/eclipse explanations.
  Worked when original and recommended results match the selected windows.
- [ ] Agent: record the running app, supply English captions and capture real
  screenshots. Worked when every project-guide link resolves and media plays.
- [ ] Agent: link this directory to a dedicated Vercel project in the connected
  account and deploy the static build. Raw source data and virtual environments
  are excluded. Worked when Vercel reports a ready production deployment.
- [ ] Agent: open the production domain without authentication, launch the
  mission, search and inspect a blocked period. Check binary data, textures,
  guide, screenshots, MP4 and captions. Worked when the public flow completes.
- [ ] Team: check Cambridge's current rules and submit through the team's NASA
  Space Apps Project tab. See `submission-requirements.md`; deployment alone
  does not enter the competition.
