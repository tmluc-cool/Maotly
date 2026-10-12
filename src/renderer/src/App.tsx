import { useEffect } from 'react';
import { SearchBox } from './components/SearchBox';
import { ConsentDialog } from './components/ConsentDialog';
import { SignInDialog } from './components/SignInDialog';
import { StatusBar } from './components/StatusBar';
import { GearIcon, InfoIcon, UserIcon } from './components/icons';
import { Logo } from './components/Logo';
import { t } from './lib/i18n';
import { href, navigate, useRoute, type Route } from './lib/router';
import { AboutPage } from './pages/AboutPage';
import { CategoryPage } from './pages/CategoryPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProductPage } from './pages/ProductPage';
import { ProjectPage } from './pages/ProjectPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { useApp } from './state';

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  input?.focus();
  input?.select();
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'product':
      return <ProductPage id={route.id} />;
    case 'project':
      return <ProjectPage id={route.id} />;
    case 'category':
      return <CategoryPage id={route.id} filters={route.filters} />;
    case 'search':
      return <SearchPage q={route.q} filters={route.filters} />;
    case 'settings':
      return <SettingsPage />;
    case 'about':
      return <AboutPage />;
    case 'privacy':
      return <PrivacyPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  const route = useRoute();
  const { ready, lang, account, setSignInOpen } = useApp();

  // Ctrl+K (Cmd+K on Mac) jumps into the search field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!document.querySelector('[data-search-input]')) {
          navigate(href.home());
          setTimeout(focusSearch, 50);
        } else {
          focusSearch();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showHeaderSearch = route.name !== 'home' && route.name !== 'search';
  const navLink = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active ? 'bg-slate-200 dark:bg-slate-800' : 'hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
    }`;

  return (
    // Keyed by language: switching it renders everything again with the new texts.
    <div key={lang} className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <a href={href.home()} className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight">
            <Logo size={32} />
            Moatly
          </a>
          <div className="flex-1">{showHeaderSearch && <div className="max-w-sm">{ready && <SearchBox size="small" />}</div>}</div>
          <nav className="flex shrink-0 gap-1">
            {account?.available &&
              (account.login ? (
                <a href={href.settings()} className={navLink(false)} title={t('nav.signedInTitle')}>
                  <UserIcon /> @{account.login}
                </a>
              ) : (
                <button type="button" className={navLink(false)} onClick={() => setSignInOpen(true)}>
                  <UserIcon /> {t('nav.signIn')}
                </button>
              ))}
            <a href={href.settings()} className={navLink(route.name === 'settings')}>
              <GearIcon /> {t('nav.settings')}
            </a>
            <a href={href.about()} className={navLink(route.name === 'about')}>
              <InfoIcon /> {t('nav.about')}
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1 pb-8">{ready ? <Page route={route} /> : null}</main>
      {ready && <StatusBar />}
      {ready && <ConsentDialog />}
      {ready && <SignInDialog />}
    </div>
  );
}
