import { useEffect, useState } from 'react';
import type { Platform, SortKey, UpdatedWithin } from '@shared/types';

export interface Filters {
  category: string | null;
  platform: Platform | null;
  minStars: number;
  updatedWithin: UpdatedWithin;
  licensed: boolean;
  activeOnly: boolean;
  sort: SortKey | null;
}

export const DEFAULT_FILTERS: Filters = {
  category: null,
  platform: null,
  minStars: 0,
  updatedWithin: 'any',
  licensed: false,
  activeOnly: false,
  sort: null,
};

export type Route =
  | { name: 'home' }
  | { name: 'search'; q: string; filters: Filters }
  | { name: 'product'; id: string }
  | { name: 'category'; id: string; filters: Filters }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'notfound' };

const SORTS: SortKey[] = ['relevance', 'stars', 'updated', 'new'];
const WITHIN: UpdatedWithin[] = ['6m', '1y', '2y', 'any'];
const PLATFORMS: Platform[] = ['windows', 'mac', 'linux', 'android', 'ios', 'web', 'server'];

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') as SortKey | null;
  const within = params.get('aktualisiert') as UpdatedWithin | null;
  const platform = params.get('plattform') as Platform | null;
  const stars = Number(params.get('sterne'));
  return {
    category: params.get('kat') || null,
    platform: platform && PLATFORMS.includes(platform) ? platform : null,
    minStars: Number.isFinite(stars) && stars > 0 ? Math.floor(stars) : 0,
    updatedWithin: within && WITHIN.includes(within) ? within : 'any',
    licensed: params.get('lizenz') === '1',
    activeOnly: params.get('aktiv') === '1',
    sort: sort && SORTS.includes(sort) ? sort : null,
  };
}

export function filtersToParams(f: Filters, params = new URLSearchParams()): URLSearchParams {
  if (f.category) params.set('kat', f.category);
  if (f.platform) params.set('plattform', f.platform);
  if (f.minStars > 0) params.set('sterne', String(f.minStars));
  if (f.updatedWithin !== 'any') params.set('aktualisiert', f.updatedWithin);
  if (f.licensed) params.set('lizenz', '1');
  if (f.activeOnly) params.set('aktiv', '1');
  if (f.sort) params.set('sort', f.sort);
  return params;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const [first = '', ...rest] = path.split('/');
  const arg = safeDecode(rest.join('/'));
  switch (first) {
    case '':
      return { name: 'home' };
    case 'suche':
      return { name: 'search', q: params.get('q') ?? '', filters: parseFilters(params) };
    case 'statt':
      return arg ? { name: 'product', id: arg } : { name: 'home' };
    case 'kategorie':
      return arg ? { name: 'category', id: arg, filters: parseFilters(params) } : { name: 'home' };
    case 'einstellungen':
      return { name: 'settings' };
    case 'ueber':
      return { name: 'about' };
    case 'datenschutz':
      return { name: 'privacy' };
    default:
      return { name: 'notfound' };
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const withQuery = (path: string, params: URLSearchParams) => {
  const q = params.toString();
  return q ? `${path}?${q}` : path;
};

export const href = {
  home: () => '#/',
  search: (q: string, f: Filters = DEFAULT_FILTERS) => withQuery('#/suche', filtersToParams(f, new URLSearchParams(q ? { q } : {}))),
  product: (id: string) => `#/statt/${encodeURIComponent(id)}`,
  category: (id: string, f: Filters = DEFAULT_FILTERS) => withQuery(`#/kategorie/${encodeURIComponent(id)}`, filtersToParams(f)),
  settings: () => '#/einstellungen',
  about: () => '#/ueber',
  privacy: () => '#/datenschutz',
};

export function navigate(to: string, replace = false) {
  if (window.location.hash === to) return;
  if (replace) {
    history.replaceState(null, '', to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    let lastPath = window.location.hash.split('?')[0];
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      const path = window.location.hash.split('?')[0];
      if (path !== lastPath) window.scrollTo(0, 0);
      lastPath = path;
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
