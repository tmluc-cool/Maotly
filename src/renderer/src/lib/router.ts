import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'product'; id: string }
  | { name: 'category'; id: string }
  | { name: 'search'; query: string }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [first = '', ...rest] = path.split('/');
  const arg = safeDecode(rest.join('/'));
  switch (first) {
    case '':
      return { name: 'home' };
    case 'statt':
      return arg ? { name: 'product', id: arg } : { name: 'home' };
    case 'kategorie':
      return arg ? { name: 'category', id: arg } : { name: 'home' };
    case 'suche':
      return { name: 'search', query: arg };
    case 'einstellungen':
      return { name: 'settings' };
    case 'ueber':
      return { name: 'about' };
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

export const href = {
  home: () => '#/',
  product: (id: string) => `#/statt/${encodeURIComponent(id)}`,
  category: (id: string) => `#/kategorie/${encodeURIComponent(id)}`,
  search: (q: string) => `#/suche/${encodeURIComponent(q)}`,
  settings: () => '#/einstellungen',
  about: () => '#/ueber',
};

export function navigate(to: string) {
  if (window.location.hash !== to) window.location.hash = to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
