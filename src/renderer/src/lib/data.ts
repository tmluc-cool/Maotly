import raw from '@data/alternatives.json';
import type { AlternativesData, Category, PaidProduct } from '@shared/types';
import { createProductSearch } from './search';

export const data = raw as AlternativesData;

export const productById = new Map<string, PaidProduct>(data.products.map((p) => [p.id, p]));
export const categoryById = new Map<string, Category>(data.categories.map((c) => [c.id, c]));
export const productSearch = createProductSearch(data.products);

export const POPULAR_IDS = ['adobe-photoshop', 'microsoft-365', 'notion', 'dropbox', '1password', 'adobe-acrobat'];

export const POPULAR_LABELS: Record<string, string> = {
  'adobe-photoshop': 'Photoshop',
  'microsoft-365': 'Microsoft 365',
  notion: 'Notion',
  dropbox: 'Dropbox',
  '1password': '1Password',
  'adobe-acrobat': 'Adobe Acrobat',
};

export function productsInCategory(categoryId: string): PaidProduct[] {
  return data.products.filter((p) => p.category === categoryId).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
