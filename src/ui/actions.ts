import type { AppData } from '../engine/load';
import { bestWindow } from '../engine/metrics';
import { useStore } from '../state/store';
import { fmtDate, pct } from './format';

const SEARCH_DAYS = 365;

/** Move the window to the best one for the selected site in the next 12 months, and say what was found. */
export function jumpToBest(data: AppData): void {
  const { siteId, windowStartMs, windowDays, setDate, setNotice } = useStore.getState();
  const site = data.sites.find((s) => s.id === siteId);
  if (!site) return;
  const best = bestWindow(data.eph, site, windowStartMs, SEARCH_DAYS, windowDays);
  if (!best) return;
  setDate(best.startMs);
  setNotice(
    best.startMs === windowStartMs
      ? `This is already the best ${windowDays}-day window for ${site.name} in the next 12 months.`
      : `Best ${windowDays}-day window for ${site.name} in the next 12 months: from ${fmtDate.format(best.startMs)}, with the Sun and Earth both in view ${pct(best.metrics.combinedPct)} of the time.`,
  );
}
