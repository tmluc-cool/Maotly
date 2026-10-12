import { addDays, EARLIEST_CREATED, type SearchFilter } from './config';

/** One part of the search space. Star bounds are inclusive; starsMax null = open-ended. */
export interface Slice {
  starsMin: number;
  starsMax: number | null;
  /** Inclusive creation-date range, only set once a slice had to be split by date. */
  createdFrom?: string;
  createdTo?: string;
}

export function rootSlice(filter: SearchFilter): Slice {
  return { starsMin: filter.minStars, starsMax: null };
}

export function sliceQuery(filter: SearchFilter, s: Slice): string {
  const parts = [...filter.qualifiers];
  if (s.starsMax === null) parts.push(`stars:>=${s.starsMin}`);
  else if (s.starsMin === s.starsMax) parts.push(`stars:${s.starsMin}`);
  else parts.push(`stars:${s.starsMin}..${s.starsMax}`);
  if (s.createdFrom && s.createdTo) parts.push(`created:${s.createdFrom}..${s.createdTo}`);
  else if (filter.createdFrom) parts.push(`created:>=${filter.createdFrom}`);
  return parts.join(' ');
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Halves a slice that has too many results.
 * Stars first (open-ended ranges double their lower bound), then the creation date.
 * Returns null if the slice can't be split further (single star value on a single day).
 */
export function splitSlice(s: Slice, filter: SearchFilter, today: string): [Slice, Slice] | null {
  if (s.starsMax === null) {
    const mid = Math.max(s.starsMin + 1, s.starsMin * 2);
    return [
      { ...s, starsMax: mid - 1 },
      { ...s, starsMin: mid, starsMax: null },
    ];
  }
  if (s.starsMin < s.starsMax) {
    const mid = Math.floor((s.starsMin + s.starsMax) / 2);
    return [
      { ...s, starsMax: mid },
      { ...s, starsMin: mid + 1 },
    ];
  }
  const from = s.createdFrom ?? filter.createdFrom ?? EARLIEST_CREATED;
  const to = s.createdTo ?? today;
  const days = daysBetween(from, to);
  if (days < 1) return null;
  const midDay = addDays(from, Math.floor(days / 2));
  return [
    { ...s, createdFrom: from, createdTo: midDay },
    { ...s, createdFrom: addDays(midDay, 1), createdTo: to },
  ];
}
