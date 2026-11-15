import type { WindowMetrics } from '../engine/types';

export const EXAMPLE_MISSION = {
  siteId: 'connecting-ridge',
  startMs: Date.UTC(2027, 0, 1),
  days: 7,
} as const;

export interface WindowSnapshot {
  siteId: string;
  startMs: number;
  days: number;
  metrics: WindowMetrics;
}

export interface WindowComparison {
  original: WindowSnapshot;
  recommended: WindowSnapshot;
  searchEndMs: number;
  /** Best date under the comparison map, independently ranked. */
  comparisonMapStartMs?: number;
}
