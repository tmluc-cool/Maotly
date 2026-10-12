import { categoryById, productsInCategory } from '../lib/data';
import { prettyRepoName } from '../lib/format';
import { href } from '../lib/router';
import { NotFoundPage } from './NotFoundPage';

export function CategoryPage({ id }: { id: string }) {
  const category = categoryById.get(id);
  if (!category) return <NotFoundPage />;
  const products = productsInCategory(id);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-8">
      <nav className="text-sm text-slate-500 dark:text-slate-400">
        <a href={href.home()} className="hover:underline">
          Start
        </a>
      </nav>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{category.name}</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">Wofür zahlst du? Wähle das Produkt aus.</p>
      <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {products.map((p) => (
          <li key={p.id}>
            <a href={href.product(p.id)} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span>
                <span className="block font-semibold">{p.name}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Gratis: {p.alternatives.map((a) => prettyRepoName(a.repo)).join(', ')}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                {p.alternatives.length}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
