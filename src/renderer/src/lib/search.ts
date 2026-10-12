import Fuse from 'fuse.js';
import type { PaidProduct } from '@shared/types';

export interface ProductSearch {
  search(query: string, limit?: number): PaidProduct[];
}

/** Typo-tolerant search over product names and aliases. */
export function createProductSearch(products: PaidProduct[]): ProductSearch {
  const fuse = new Fuse(products, {
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'aliases', weight: 0.4 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  return {
    search(query, limit = 8) {
      const q = query.trim();
      if (q.length < 2) return [];
      const lower = q.toLowerCase();
      // Exact name/alias hits first, then fuzzy results.
      const exact = products.filter(
        (p) => p.name.toLowerCase() === lower || p.aliases.some((a) => a.toLowerCase() === lower),
      );
      const fuzzy = fuse.search(q).map((r) => r.item);
      const seen = new Set<string>();
      const out: PaidProduct[] = [];
      for (const p of [...exact, ...fuzzy]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}
