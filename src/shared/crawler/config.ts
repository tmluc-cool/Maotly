/** Search filters and limits for the crawler. Dates are ISO days (YYYY-MM-DD). */

export const PER_PAGE = 100;
/** GitHub returns at most this many results per search query. */
export const MAX_RESULTS_PER_QUERY = 1000;
/** Earliest creation date used when a slice has to be split by date. */
export const EARLIEST_CREATED = '2007-10-01';

/** Min. time between two search requests (GitHub: 10/min without token, 30/min with). */
export const SEARCH_INTERVAL_MS = { anonymous: 6_200, token: 2_100 };

export interface SearchFilter {
  /** Lower bound for stars (the crawler splits ranges above it). */
  minStars: number;
  /** Fixed qualifiers, e.g. "fork:false". */
  qualifiers: string[];
  /** Only repos created on/after this day. Date splits stay inside this range. */
  createdFrom?: string;
}

export function isoDay(date: Date | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Base database: popular, maintained, original projects. */
export function baseFilter(today: string): SearchFilter {
  return {
    minStars: 100,
    qualifiers: ['fork:false', 'archived:false', `pushed:>=${addDays(today, -730)}`],
  };
}

/** Weekly update: known-size projects that changed since the given day. */
export function updatesFilter(since: string): SearchFilter {
  return { minStars: 100, qualifiers: ['fork:false', `pushed:>=${since}`] };
}

/** Weekly update: young projects that already got some attention. */
export function newProjectsFilter(since: string): SearchFilter {
  return { minStars: 20, qualifiers: ['fork:false'], createdFrom: since };
}

/** Minimum stars for a network submission to be accepted. */
export const SUBMISSION_MIN_STARS = 20;
