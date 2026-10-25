import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleCheck, CircleX, Database, House, KeyRound, ListChecks, LoaderCircle, LogOut, Map as MapIcon, RefreshCw, ShieldCheck, StickyNote, Tags, Target, X,
} from 'lucide-react';
import { StoreProvider, useStore } from './store';
import { api } from './api';
import { Brand, Button, Card, cx } from './ui';
import HomeView from './views/HomeView';
import TasksView from './views/TasksView';
import CareerView from './views/CareerView';
import CategoriesView from './views/CategoriesView';
import VaultView from './views/VaultView';
import StickyView from './views/StickyView';
import WealthView from './views/wealth/WealthView';

// `zone` = the DevOBJ zone colour shown as a small square beside each section.
// `inMenu` views live in the account dropdown instead of the header nav; `hidden` views are
// reachable only by their URL (e.g. #/wealth).
const VIEWS = [
  { key: 'home', label: 'Home', Icon: House, zone: 'bg-ink' },
  { key: 'tasks', label: 'Tasks', Icon: ListChecks, zone: 'bg-zone-blue' },
  { key: 'career', label: 'Career', Icon: Target, zone: 'bg-zone-green' },
  { key: 'sticky', label: 'Notes', Icon: StickyNote, zone: 'bg-zone-mag' }, // #/sticky: linked from the DevOBJ island
  { key: 'categories', label: 'Categories', Icon: Tags, zone: 'bg-zone-orange', inMenu: true },
  { key: 'vault', label: 'Vault', Icon: KeyRound, zone: 'bg-zone-violet' }, // web only
  { key: 'wealth', label: 'Wealth', hidden: true }, // web only, #/wealth
  { key: 'office', label: 'Office Tasks', hidden: true }, // #/office: Office tasks only, no header/footer
];

// The DevOBJ town map this app is reached from (its private island); the header links back to it.
const TOWN_MAP_URL = `${(import.meta.env.VITE_DEVOBJ_URL || 'http://localhost:3000').replace(/\/$/, '')}/#town`;

// Hash routing (#/tasks) so links and refresh work without server-side routes.
const NAV_VIEWS = VIEWS.filter((v) => !v.inMenu && !v.hidden);
const MENU_VIEWS = VIEWS.filter((v) => v.inMenu && !v.hidden);

const viewFromHash = () => {
  // /office (a real path, served by the index.html fallback) is the standalone Office page.
  if (/^\/office\/?$/.test(window.location.pathname)) return 'office';
  const key = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.key === key) ? key : 'home';
};

function Header({ view, navigate }) {
  const { state } = useStore();
  return (
    <header className="sticky top-0 z-40 bg-white border-b-[1.5px] border-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <a href="#/home" className="shrink-0" aria-label="Task Assistant home">
          <Brand />
        </a>
        {state.user?.dev && (
          <span className="hidden lg:inline-flex shrink-0 whitespace-nowrap px-2 py-0.5 rounded-md border border-ink bg-taxi text-ink font-mono text-[10px] font-semibold uppercase tracking-wide">
            Dev mode
          </span>
        )}
        <nav className="hidden md:flex items-center gap-0.5 ml-2">
          {NAV_VIEWS.map(({ key, label, zone }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(key)}
              aria-current={view === key ? 'page' : undefined}
              className={cx(
                'inline-flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-sm font-semibold whitespace-nowrap transition',
                view === key ? 'bg-taxi text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'text-stone-700 hover:text-ink hover:bg-stone-100',
              )}
            >
              <span className={cx('w-2.5 h-2.5 rounded-[2px]', zone)} />
              {label}
            </button>
          ))}
        </nav>
        <a
          href={TOWN_MAP_URL}
          title="Back to the DevOBJ town map"
          className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-2 h-9 px-2.5 lg:px-3.5 rounded-[10px] border-[1.5px] border-ink bg-ink text-white text-sm font-semibold shadow-[0_3px_0_#000] hover:bg-stone-800 active:translate-y-0.5 active:shadow-none transition"
        >
          <MapIcon className="w-4 h-4" aria-hidden="true" />
          {/* Full label where there is room; icon only next to the nav on medium screens and on phones. */}
          <span className="hidden lg:inline">Town map</span>
          <span className="lg:hidden sr-only">Town map</span>
        </a>
        {state.user && <UserMenu user={state.user} view={view} navigate={navigate} />}
      </div>
      {/* Small screens: views as a scrollable row under the brand bar */}
      <nav className="md:hidden flex gap-1 overflow-x-auto px-4 pb-2.5">
        {NAV_VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(key)}
            aria-current={view === key ? 'page' : undefined}
            className={cx(
              'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition',
              view === key ? 'bg-taxi text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'text-stone-700 bg-stone-100',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

// Account dropdown: the menu-only views (Categories), the database connection, and sign out.
function UserMenu({ user, view, navigate }) {
  const { state, actions } = useStore();
  const connected = state.status === 'ready';
  const loading = state.status === 'loading';
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const initial = (user.name || user.email).charAt(0).toUpperCase();
  const item = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm font-medium text-left transition';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={connected ? 'Account' : 'Account (database not connected)'}
        aria-expanded={open}
        className={cx(
          'relative w-9 h-9 rounded-[10px] border-[1.5px] border-ink bg-purple-50 text-purple-700 font-display text-sm font-extrabold flex items-center justify-center hover:shadow-key transition',
          MENU_VIEWS.some((v) => v.key === view) && 'bg-taxi text-ink',
        )}
      >
        {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-full h-full rounded-[8px] object-cover" /> : initial}
        {/* The DB status lives in this menu now, so a lost connection still shows on the avatar. */}
        {!connected && !loading && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-600 border-2 border-white" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border-[1.5px] border-ink shadow-block p-2 z-50">
          <div className="px-3 py-2.5">
            {user.name && <div className="text-sm font-semibold text-ink truncate">{user.name}</div>}
            <div className="text-xs text-stone-500 truncate">{user.email}</div>
          </div>
          <div className="border-t-[1.5px] border-stone-200 my-1" />
          {MENU_VIEWS.map(({ key, label, Icon, zone }) => (
            <button
              key={key}
              type="button"
              onClick={() => { navigate(key); setOpen(false); }}
              aria-current={view === key ? 'page' : undefined}
              className={cx(item, view === key ? 'bg-taxi text-ink font-semibold' : 'text-stone-700 hover:bg-stone-100 hover:text-ink')}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1">{label}</span>
              <span className={cx('w-2.5 h-2.5 rounded-[2px]', zone)} />
            </button>
          ))}
          <button
            type="button"
            onClick={actions.reload}
            title={connected ? 'Connected to MongoDB. Click to refresh.' : 'Not connected. Click to retry.'}
            className={cx(item, 'text-stone-700 hover:bg-stone-100 hover:text-ink')}
          >
            <Database className="w-4 h-4" />
            <span className="flex-1">Database</span>
            <span
              className={cx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[10.5px] font-semibold uppercase',
                connected ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'bg-rose-50 border-rose-600 text-rose-700',
              )}
            >
              {loading ? <LoaderCircle className="w-3 h-3 animate-spin" /> : connected ? <CircleCheck className="w-3 h-3" /> : <CircleX className="w-3 h-3" />}
              {loading ? 'Syncing' : connected ? 'Connected' : 'Offline'}
            </span>
          </button>
          <div className="border-t-[1.5px] border-stone-200 my-1" />
          <button
            type="button"
            onClick={actions.signOut}
            className={cx(item, 'text-stone-700 hover:bg-rose-50 hover:text-rose-700')}
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Google Identity Services script, loaded once on demand.
let gsiPromise;
const loadGoogleScript = () =>
  (gsiPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error('could not load Google sign-in'));
    };
    document.head.appendChild(s);
  }));

// `popup` shows the sign-in card as a modal over a blank backdrop (used by the standalone #/office page).
function SignIn({ popup = false }) {
  const { state, actions } = useStore();
  const buttonRef = useRef(null);
  const [error, setError] = useState(state.error);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null); // { googleClientId, devLogin }

  const adminSignIn = async () => {
    setBusy(true);
    setError(null);
    const message = await actions.signIn(null);
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.authConfig();
        if (cancelled) return;
        setConfig(cfg);
        const { googleClientId } = cfg;
        if (!googleClientId) return; // dev mode without Google configured yet
        await loadGoogleScript();
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setBusy(true);
            setError(null);
            const message = await actions.signIn(credential);
            if (message) {
              setError(message);
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 300,
        });
      } catch (e) {
        if (!cancelled) setError(`Google sign-in is unavailable: ${e.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actions]);

  return (
    <div
      role={popup ? 'dialog' : undefined}
      aria-modal={popup || undefined}
      className={popup ? 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm' : 'min-h-screen flex items-center justify-center p-4 bg-paper'}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <Brand large />
        </div>
        <Card block className="p-6 text-center">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">DevOBJ · private</div>
          <h1 className="text-2xl font-extrabold text-ink mt-1">Welcome <span className="hl">back</span></h1>
          <p className="text-sm text-stone-500 mt-1">Sign in with your Google account to continue.</p>
          <div className="flex justify-center mt-6 min-h-11">
            {/* The Google button stays mounted (it is rendered into this div once) and is hidden while signing in. */}
            {busy && <LoaderCircle className="w-6 h-6 text-ink animate-spin" />}
            <div ref={buttonRef} className={busy ? 'hidden' : undefined} />
            {config && !config.googleClientId && !busy && (
              <p className="text-xs text-stone-400 self-center">Google sign-in is not configured yet.</p>
            )}
          </div>
          {config?.devLogin && !busy && (
            <div className="mt-5 pt-5 border-t-[1.5px] border-dashed border-stone-300">
              <Button variant="dark" icon={ShieldCheck} onClick={adminSignIn} className="w-full">
                Admin
              </Button>
              <p className="text-[11px] text-stone-500 mt-2">
                Dev mode: signs in without Google. Only shown on this PC and your local network.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400 mt-6">
            <ShieldCheck className="w-3.5 h-3.5" /> Private app. Only approved accounts can sign in.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Toast() {
  const { state, actions } = useStore();
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(actions.dismissToast, 6000);
    return () => clearTimeout(t);
  }, [state.toast, actions]);
  if (!state.toast) return null;
  return (
    <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-3 max-w-[calc(100%-2rem)] px-4 py-3 rounded-[10px] border-[1.5px] border-ink bg-ink text-white text-sm shadow-block-taxi">
      <span className="font-semibold text-rose-300">Something went wrong:</span>
      <span className="truncate">{state.toast}</span>
      <button type="button" onClick={actions.dismissToast} aria-label="Dismiss" className="text-stone-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function Shell() {
  const { state, actions } = useStore();
  const [view, setView] = useState(viewFromHash);
  // Filter handed to Tasks when another view links to it; a new object each time so repeat clicks re-apply.
  const [taskPreset, setTaskPreset] = useState(null);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((key, preset) => {
    if (key === 'tasks') setTaskPreset({ ...(preset || {}) });
    window.location.hash = `/${key}`;
    setView(key);
    window.scrollTo({ top: 0 });
  }, []);

  const standalone = view === 'office';
  if (state.status === 'auth') return <SignIn popup={standalone} />;

  let body;
  if (state.status === 'error' && !state.profile) {
    body = (
      <Card className="max-w-md mx-auto mt-16 p-6 text-center">
        <h1 className="text-xl font-bold">Can't load your data</h1>
        <p className="text-sm text-stone-500 mt-1">{state.error}</p>
        <Button icon={RefreshCw} onClick={actions.reload} className="mt-5">Try again</Button>
      </Card>
    );
  } else if (state.status === 'loading' && !state.profile) {
    body = (
      <div className="flex justify-center mt-24">
        <LoaderCircle className="w-8 h-8 text-ink animate-spin" />
      </div>
    );
  } else {
    body = (
      <>
        {view === 'home' && <HomeView navigate={navigate} />}
        {view === 'tasks' && <TasksView preset={taskPreset} />}
        {view === 'career' && <CareerView />}
        {view === 'categories' && <CategoriesView navigate={navigate} />}
        {view === 'vault' && <VaultView />}
        {view === 'sticky' && <StickyView />}
        {view === 'wealth' && <WealthView />}
        {view === 'office' && <TasksView preset={taskPreset} fixedMode="office" />}
      </>
    );
  }

  if (standalone) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{body}</main>
        <Toast />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header view={view} navigate={navigate} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{body}</main>
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span className="font-semibold text-stone-700">Task Assistant</span>
          <span>Direct Database Architecture (MongoDB) · same data as the mobile app</span>
        </div>
      </footer>
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
