import { useState } from 'react';
import { useStore } from '../state/store';
import { useEscape } from './hooks';
import { launchMission } from './actions';

export const PROJECT_OPENING = 'A bright landing site can still lose sight of home. Southlight turns NASA lunar terrain and Sun–Earth geometry into a mission you can explore: compare dates, find time with sunlight and Earth in view together, and inspect the ridge or eclipse behind each interruption.';

export function SubmissionSheet() {
  const close = () => useStore.getState().setPanel('none');
  const [videoFailed, setVideoFailed] = useState(false);
  useEscape(close);
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet sheet-wide submission-sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={e => e.stopPropagation()}>
        <header className="sheet-head"><h1 id="guide-title">A clearer view of the next landing.</h1><button type="button" className="round round-x" aria-label="Close project guide" onClick={close} autoFocus>✕</button></header>
        <div className="sheet-body">
          <section><p className="eyebrow">Southlight · NASA Space Apps</p><p className="project-opening">{PROJECT_OPENING}</p><button type="button" className="pill" onClick={launchMission}>Try the seven-day mission <span aria-hidden="true">→</span></button></section>
          <section><h2>Watch one mission, start to finish</h2>
            <video controls preload="none" poster="/submission/mission-original.jpg" width={1280} height={800} onError={() => setVideoFailed(true)}>
              <source src="/submission/southlight-walkthrough.mp4" type="video/mp4" />
              <track kind="captions" src="/submission/walkthrough.vtt" srcLang="en" label="English" />
            </video>
            {videoFailed && <p role="status">The recording could not play here. <a href="/submission/southlight-walkthrough.mp4">Open the MP4 directly</a> or try the interactive mission above.</p>}
            <p className="muted">A real screen recording, with English captions. <a href="/submission/walkthrough-transcript.txt">Read the transcript</a>.</p>
          </section>
          <section><h2>One location. Two very different windows.</h2><p>Connecting Ridge, seven days from 1 January 2027: 100% sunlight, 0% Earth visibility. Starting 10 January instead: both in view for 100% of the sampled window.</p><div className="submission-images"><figure><img src="/submission/mission-original.jpg" width={1280} height={800} loading="lazy" alt="Connecting Ridge example before searching: sunlight available but Earth hidden." /><figcaption>The original window</figcaption></figure><figure><img src="/submission/mission-comparison.jpg" width={1280} height={800} loading="lazy" alt="Southlight showing original and recommended windows side by side." /><figcaption>The date comparison</figcaption></figure></div></section>
          <section><h2>Science you can inspect</h2><p>NASA DE440/SPICE positions and LOLA terrain drive every figure. Geometric eclipses are included. The timeline, skyline and scene share one UTC moment. Direction checks against NASA/JPL Horizons and terrain sensitivity are available with the results.</p><p>These are sampled geometric visibility estimates, not an assessment of solar energy yield, a working radio system, or landing safety. The sunlight verdict thresholds are our own, not NASA standards.</p><button type="button" className="link" onClick={() => useStore.getState().setPanel('trust')}>Read the methods, validation and limitations</button></section>
          <section><h2>Project materials</h2><p><a href="/submission/project-description.md" download>Download the project description</a> · <a href="/submission/mission-comparison.jpg" download>Download the comparison screenshot</a> · <a href="/submission/southlight-walkthrough.mp4" download>Download the walkthrough</a></p><p>AI assistance: Claude (Anthropic) and Codex (OpenAI) helped develop and review the code. The screenshots and walkthrough capture the running app. The sky style was adapted from the team’s earlier Voca project; credits and sources are in “How we know.”</p></section>
        </div>
      </section>
    </div>
  );
}
