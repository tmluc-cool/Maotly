import { SearchBox } from '../components/SearchBox';
import { data, POPULAR_IDS, POPULAR_LABELS, productsInCategory } from '../lib/data';
import { href } from '../lib/router';

export function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Gratis statt <span className="text-brand-600 dark:text-brand-400">teuer</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
          Gib ein, für welche Software du bezahlst. Wir zeigen dir kostenlose Open-Source-Alternativen von GitHub.
        </p>
        <div className="mx-auto mt-8 max-w-2xl text-left">
          <SearchBox size="large" autoFocus />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <span className="py-1.5 text-sm text-slate-500 dark:text-slate-400">Beliebt:</span>
          {POPULAR_IDS.map((id) => (
            <a key={id} href={href.product(id)} className="chip">
              {POPULAR_LABELS[id]}
            </a>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-xl font-bold">Kategorien</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {data.categories.map((c) => {
            const count = productsInCategory(c.id).length;
            return (
              <li key={c.id}>
                <a
                  href={href.category(c.id)}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600"
                >
                  <span className="block font-semibold">{c.name}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {count} {count === 1 ? 'Produkt' : 'Produkte'}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
