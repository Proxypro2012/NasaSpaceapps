import type { AppData } from '../engine/load';
import { bestWindow, DAY_MS, windowDateLimits, windowMetrics } from '../engine/metrics';
import { prefersReducedMotion, useStore } from '../state/store';
import { jumpDuration } from '../state/motion';

const SEARCH_DAYS = 365;
let searchSequence = 0;

function revealResult(): void {
  const card = document.querySelector<HTMLElement>('.card');
  const behavior = prefersReducedMotion() ? 'instant' : 'smooth';
  card?.scrollTo({ top: 0, behavior });
  if (matchMedia('(max-width: 1079px)').matches) card?.scrollIntoView({ block: 'start', behavior });
}

export function launchMission(): void {
  useStore.getState().startMission();
  requestAnimationFrame(revealResult);
}

/** Move the window to the best one for the selected site in the next 12 months, and say what was found. */
export function jumpToBest(data: AppData): void {
  const { siteId, windowStartMs, windowDays, comparison, setComparison, setDate, setNotice, dismissBriefing } = useStore.getState();
  const site = data.sites.find((s) => s.id === siteId);
  if (!site) return;
  const original = comparison?.recommended.startMs === windowStartMs && comparison.original.siteId === siteId && comparison.original.days === windowDays
    ? comparison.original
    : { siteId, startMs: windowStartMs, days: windowDays, metrics: windowMetrics(data.eph, site, windowStartMs, windowDays) };
  const best = bestWindow(data.eph, site, original.startMs, SEARCH_DAYS, windowDays);
  if (!best) return;
  // Compare the recommendation itself, not just its sunlight verdict, across maps.
  const coarse = site.comparison ? bestWindow(data.eph, site.comparison, original.startMs, SEARCH_DAYS, windowDays) : null;
  dismissBriefing();
  useStore.getState().setPanel('none');
  setDate(best.startMs, true, jumpDuration(best.startMs - windowStartMs));
  setComparison({
    original,
    recommended: { siteId, startMs: best.startMs, days: windowDays, metrics: best.metrics },
    searchEndMs: Math.min(windowDateLimits(data.eph, windowDays).last, original.startMs + (SEARCH_DAYS - 1) * DAY_MS),
    comparisonMapStartMs: coarse?.startMs,
  });
  // The comparison is the persistent result; a duplicate toast obscures it on phones.
  setNotice(null);
}

/** Paint progress before the bounded local calculation; reject duplicate clicks. */
export async function findBetterWindow(data: AppData): Promise<void> {
  if (useStore.getState().searching) return;
  // Freeze the inputs before yielding; playback would otherwise invalidate them.
  useStore.getState().setPlaying(false);
  const started = useStore.getState();
  const sequence = ++searchSequence;
  useStore.setState({ searching: true });
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const current = useStore.getState();
    if (current.navigationVersion !== started.navigationVersion ||
        current.windowStartMs !== started.windowStartMs || current.windowDays !== started.windowDays ||
        current.targetMs !== started.targetMs || current.siteId !== started.siteId || current.audience !== started.audience) return;
    jumpToBest(data);
    revealResult();
  } catch {
    useStore.getState().setNotice('The window search could not finish. Please try again.');
  } finally {
    if (sequence === searchSequence) useStore.setState({ searching: false });
  }
}
