import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, EyeOff, KeyRound, Lock, LockOpen, Pencil, Plus, RefreshCw,
  Search, ShieldCheck, Trash, TriangleAlert, Wand,
} from 'lucide-react';
import { AuthError, vaultApi } from '../api';
import { useStore } from '../store';
import { clearVaultSession, getVaultSession, lockVault, setVaultSession, subscribeVault } from '../vaultSession';
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHero, cx, inputClass } from '../ui';
import { TONES } from '../theme';

const PAGE_SIZE = 10;
const REVEAL_SECONDS = 30;

/* ---------- PIN input: 4 boxes over one numeric field ---------- */

function PinInput({ value, onChange, onComplete, autoFocus, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="relative w-fit mx-auto" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        aria-label={label}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 4);
          onChange(next);
          if (next.length === 4) onComplete?.(next);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cx(
              'w-12 h-14 rounded-xl border-2 flex items-center justify-center bg-stone-50 transition',
              i === value.length ? 'border-emerald-500 ring-2 ring-emerald-500/20' : value[i] ? 'border-stone-300' : 'border-stone-200',
            )}
          >
            {value[i] && <span className="w-3 h-3 rounded-full bg-stone-900" />}
          </div>
        ))}
      </div>
    </div>
  );
}

const lockMessage = (until) =>
  `Too many wrong PINs. Try again after ${new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;

// Asks for the PIN and unlocks the vault for 5 minutes. Resolves via onUnlocked.
function UnlockModal({ open, reason, onUnlocked, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  const submit = async (value = pin) => {
    if (value.length !== 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      const { unlockToken, expiresAt } = await vaultApi.unlock(value);
      setVaultSession(unlockToken, expiresAt);
      onUnlocked();
    } catch (e) {
      if (e.data?.lockedUntil) setError(lockMessage(e.data.lockedUntil));
      else if (e.data?.attemptsLeft != null) setError(`Wrong PIN. ${e.data.attemptsLeft} attempt${e.data.attemptsLeft === 1 ? '' : 's'} left.`);
      else setError(e.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Enter your vault PIN" onClose={onClose}>
      <div className="text-center">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 items-center justify-center">
          <Lock className="w-5 h-5 text-emerald-700" />
        </span>
        <p className="text-sm text-stone-500 mt-3">{reason || 'Enter your 4-digit PIN.'} The vault stays unlocked for 5 minutes.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <PinInput label="4-digit PIN" value={pin} onChange={setPin} onComplete={submit} autoFocus />
        {error && <p role="alert" className="text-center text-xs font-medium text-rose-600">{error}</p>}
        <div className="flex justify-center">
          <Button type="submit" icon={LockOpen} disabled={pin.length !== 4 || busy}>{busy ? 'Checking…' : 'Unlock'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- First-time setup ---------- */

function SetupCard({ onDone }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (pin !== confirm) return setError('The two PINs do not match.');
    setBusy(true);
    try {
      const { unlockToken, expiresAt } = await vaultApi.setup(pin);
      setVaultSession(unlockToken, expiresAt);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-lg mx-auto mt-6 p-6">
      <div className="text-center">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-emerald-700" />
        </span>
        <h2 className="text-lg font-semibold text-stone-900 mt-3">Create your vault PIN</h2>
        <p className="text-sm text-stone-500 mt-1">
          Your 4-digit PIN, combined with a secret kept on the server, encrypts every saved password.
        </p>
      </div>
      <form onSubmit={create} className="space-y-5 mt-6">
        <div>
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-center mb-2">New PIN</p>
          <PinInput label="New PIN" value={pin} onChange={setPin} autoFocus />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-center mb-2">Confirm PIN</p>
          <PinInput label="Confirm PIN" value={confirm} onChange={setConfirm} />
        </div>
        <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>If you forget this PIN, your saved passwords cannot be recovered. Nobody, including the server, can decrypt them without it.</span>
        </div>
        {error && <p role="alert" className="text-center text-xs font-medium text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pin.length !== 4 || confirm.length !== 4 || busy}>
          {busy ? 'Creating…' : 'Create vault'}
        </Button>
      </form>
    </Card>
  );
}

/* ---------- Entry form ---------- */

const GEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
function generatePassword(length = 20) {
  const out = [];
  const buf = new Uint32Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    // Rejection sampling keeps every character equally likely.
    if (buf[0] < Math.floor(2 ** 32 / GEN_CHARS.length) * GEN_CHARS.length) out.push(GEN_CHARS[buf[0] % GEN_CHARS.length]);
  }
  return out.join('');
}

function EntryForm({ open, entry, secrets, onSave, onClose }) {
  const [form, setForm] = useState({});
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm({
      title: entry?.title || '', username: entry?.username || '', url: entry?.url || '',
      password: secrets?.password || '', notes: secrets?.notes || '',
    });
    setShow(false);
    setError('');
    setBusy(false);
  }, [open, entry, secrets]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Title is required');
    if (!form.password) return setError('Password is required');
    setBusy(true);
    const message = await onSave({ ...form, title: form.title.trim(), username: form.username.trim(), url: form.url.trim() });
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={entry ? 'Edit password' : 'Save a password'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="vault-entry-form" disabled={busy}>{busy ? 'Encrypting…' : 'Save encrypted'}</Button>
        </>
      }
    >
      <form id="vault-entry-form" onSubmit={submit} className="space-y-5" autoComplete="off">
        <Field label="Title">
          <input autoFocus className={inputClass} value={form.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Azure Portal" />
        </Field>
        <Field label="Username / email">
          <input className={inputClass} value={form.username || ''} onChange={(e) => set({ username: e.target.value })} placeholder="name@example.com" autoComplete="off" />
        </Field>
        <div>
          <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Password</span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className={cx(inputClass, 'pr-10 font-mono')}
                type={show ? 'text' : 'password'}
                value={form.password || ''}
                onChange={(e) => set({ password: e.target.value })}
                autoComplete="new-password"
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button variant="soft" icon={Wand} onClick={() => { set({ password: generatePassword() }); setShow(true); }}>Generate</Button>
          </div>
        </div>
        <Field label="Website">
          <input className={inputClass} value={form.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://portal.azure.com" />
        </Field>
        <Field label="Notes (encrypted)">
          <textarea rows={3} className={inputClass} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Recovery codes, security questions…" />
        </Field>
        {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------- Settings: change PIN / reset ---------- */

function ChangePinModal({ open, onClose, onChanged }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) return setError('The new PINs do not match.');
    try {
      const { unlockToken, expiresAt } = await vaultApi.changePin(current, next);
      setVaultSession(unlockToken, expiresAt);
      onChanged();
    } catch (err) {
      if (err.data?.lockedUntil) setError(lockMessage(err.data.lockedUntil));
      else if (err.data?.attemptsLeft != null) setError(`Current PIN is wrong. ${err.data.attemptsLeft} attempts left.`);
      else setError(err.message);
    }
  };

  return (
    <Modal
      open={open}
      title="Change vault PIN"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="change-pin-form" disabled={current.length !== 4 || next.length !== 4 || confirm.length !== 4}>Change PIN</Button>
        </>
      }
    >
      <form id="change-pin-form" onSubmit={submit} className="space-y-5">
        {[['Current PIN', current, setCurrent], ['New PIN', next, setNext], ['Confirm new PIN', confirm, setConfirm]].map(([label, value, setter], i) => (
          <div key={label}>
            <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-center mb-2">{label}</p>
            <PinInput label={label} value={value} onChange={setter} autoFocus={i === 0} />
          </div>
        ))}
        {error && <p role="alert" className="text-center text-xs font-medium text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function ResetModal({ open, onClose, onReset }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setError('');
    }
  }, [open]);
  return (
    <Modal
      open={open}
      title="Reset vault"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={text !== 'DELETE'}
            onClick={async () => {
              try {
                await vaultApi.reset();
                onReset();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Delete all saved passwords
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-600">
        Use this only if you forgot your PIN. <strong>Every saved password is permanently deleted</strong>, then you can create a new PIN.
      </p>
      <Field label='Type "DELETE" to confirm'>
        <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </Modal>
  );
}

/* ---------- Main view ---------- */

function useCountdown(session) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);
  if (!session) return null;
  const s = Math.max(0, Math.round((session.expiresAt - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VaultView() {
  const { actions } = useStore();
  const [status, setStatus] = useState(null); // { initialized, lockedUntil }
  const [session, setSession] = useState(getVaultSession);
  const [list, setList] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState(''); // debounced
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({}); // id -> { password, notes, until }
  const [copied, setCopied] = useState(null);
  const [notice, setNotice] = useState(null); // { tone, text }
  const [unlockPrompt, setUnlockPrompt] = useState(null); // { reason, resolve }
  const [form, setForm] = useState(null); // { entry?, secrets? }
  const [modal, setModal] = useState(null); // 'pin' | 'reset'
  const countdown = useCountdown(session);

  useEffect(() => subscribeVault(() => setSession(getVaultSession())), []);
  // Locking hides anything that was revealed.
  useEffect(() => {
    if (!session) setRevealed({});
  }, [session]);

  // Auto-hide revealed passwords.
  useEffect(() => {
    const ids = Object.keys(revealed);
    if (!ids.length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setRevealed((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.until > now)));
    }, 1000);
    return () => clearInterval(t);
  }, [revealed]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const flash = (text, tone = 'emerald') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3000);
  };

  const handleError = useCallback(
    (e) => {
      if (e instanceof AuthError) return actions.reload(); // session ended: back to sign-in
      flash(e.message, 'rose');
    },
    [actions],
  );

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await vaultApi.status(getVaultSession()?.token));
    } catch (e) {
      handleError(e);
    }
  }, [handleError]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setList(await vaultApi.list({ page, limit: PAGE_SIZE, q }));
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [page, q, handleError]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);
  useEffect(() => {
    if (status?.initialized) loadList();
  }, [status?.initialized, loadList]);

  // Runs fn(unlockToken), asking for the PIN first when the vault is locked (or the server says it is).
  const withUnlock = useCallback(async (reason, fn) => {
    const ask = () => new Promise((resolve) => setUnlockPrompt({ reason, resolve }));
    let current = getVaultSession();
    if (!current) {
      if (!(await ask())) return undefined;
      current = getVaultSession();
    }
    try {
      return await fn(current.token);
    } catch (e) {
      if (e.status !== 423) throw e;
      clearVaultSession(); // e.g. server restarted
      if (!(await ask())) return undefined;
      return fn(getVaultSession().token);
    }
  }, []);

  const reveal = async (entry) => {
    try {
      const secrets = await withUnlock(`View the password for ${entry.title}.`, (t) => vaultApi.reveal(t, entry.id));
      if (secrets) setRevealed((r) => ({ ...r, [entry.id]: { ...secrets, until: Date.now() + REVEAL_SECONDS * 1000 } }));
    } catch (e) {
      handleError(e);
    }
  };

  const copy = async (entry) => {
    try {
      const password =
        revealed[entry.id]?.password ??
        (await withUnlock(`Copy the password for ${entry.title}.`, (t) => vaultApi.reveal(t, entry.id)))?.password;
      if (password == null) return;
      await navigator.clipboard.writeText(password);
      setCopied(entry.id);
      setTimeout(() => setCopied((c) => (c === entry.id ? null : c)), 2000);
    } catch (e) {
      handleError(e.name === 'NotAllowedError' ? new Error('The browser blocked clipboard access') : e);
    }
  };

  const openEdit = async (entry) => {
    try {
      const secrets = await withUnlock(`Edit ${entry.title}.`, (t) => vaultApi.reveal(t, entry.id));
      if (secrets) setForm({ entry, secrets });
    } catch (e) {
      handleError(e);
    }
  };

  const save = async (data) => {
    try {
      const done = await withUnlock('Encrypt and save this password.', (t) =>
        form.entry ? vaultApi.update(t, form.entry.id, data) : vaultApi.create(t, data),
      );
      if (!done) return 'Vault is locked. Enter your PIN to save.';
      setForm(null);
      flash(form.entry ? 'Password updated' : 'Password saved, encrypted');
      setRevealed((r) => {
        const { [form.entry?.id]: _, ...rest } = r;
        return rest;
      });
      loadList();
      return null;
    } catch (e) {
      if (e instanceof AuthError) handleError(e);
      return e.message;
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete the saved password for "${entry.title}"? This cannot be undone.`)) return;
    try {
      const ok = await withUnlock(`Delete ${entry.title}.`, (t) => vaultApi.remove(t, entry.id).then(() => true));
      if (!ok) return;
      flash('Password deleted');
      // Step back a page if this was the last item on it.
      if (list.items.length === 1 && page > 1) setPage(page - 1);
      else loadList();
    } catch (e) {
      handleError(e);
    }
  };

  if (!status) {
    return (
      <div className="flex justify-center mt-24">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const header = (
    <PageHero
      icon={KeyRound}
      eyebrow="Password Manager"
      title="Password Vault"
      description="Passwords and notes are encrypted with your 4-digit PIN plus a server-side secret before they are stored."
      actions={
        status.initialized && (
          <>
            {session ? (
              <Button variant="ghost" icon={Lock} onClick={lockVault} title="Lock now">
                <span className="tabular-nums">Unlocked · {countdown}</span>
              </Button>
            ) : (
              <Button variant="ghost" icon={Lock} onClick={() => withUnlock('Unlock the vault.', async () => true)}>Locked</Button>
            )}
            <Button icon={Plus} onClick={() => setForm({})}>Add password</Button>
          </>
        )
      }
    />
  );

  if (!status.initialized) {
    return (
      <>
        {header}
        <SetupCard onDone={() => { loadStatus(); flash('Vault created and unlocked'); }} />
      </>
    );
  }

  const from = list.total ? (list.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(list.page * PAGE_SIZE, list.total);
  const pageNumbers = (() => {
    const start = Math.max(1, Math.min(list.page - 2, list.pages - 4));
    return Array.from({ length: Math.min(5, list.pages) }, (_, i) => start + i);
  })();

  return (
    <>
      {header}

      {status.lockedUntil && (
        <div role="alert" className="mt-4 flex gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {lockMessage(status.lockedUntil)}
        </div>
      )}

      <Card className="mt-5 overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              className={cx(inputClass, 'pl-10')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, username or website…"
              aria-label="Search saved passwords"
            />
          </div>
          <span className="text-xs text-stone-500 shrink-0">{list.total} saved</span>
        </div>

        {list.items.length === 0 && !loading ? (
          <div className="p-6">
            <EmptyState
              icon={KeyRound}
              title={q ? 'No matches' : 'No passwords yet'}
              text={q ? 'Try a different search.' : 'Click "Add password" to save your first one.'}
            />
          </div>
        ) : (
          <ul className={cx('divide-y divide-stone-100', loading && 'opacity-60')}>
            {list.items.map((entry) => {
              const shown = revealed[entry.id];
              return (
                <li key={entry.id} className="px-4 py-3.5 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-sm font-bold font-display text-stone-700">
                    {entry.title.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0 md:w-56 md:flex-none">
                    <div className="text-sm font-semibold text-stone-900 truncate">{entry.title}</div>
                    {entry.url ? (
                      <a
                        href={/^https?:\/\//i.test(entry.url) ? entry.url : `https://${entry.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-emerald-700 max-w-full"
                      >
                        <span className="truncate">{entry.url.replace(/^https?:\/\//i, '')}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <div className="text-xs text-stone-400">No website</div>
                    )}
                  </div>
                  <div className="w-full md:w-auto md:flex-1 min-w-0 grid grid-cols-[auto_1fr] md:grid-cols-2 gap-x-3 gap-y-1 text-sm order-last md:order-none">
                    <span className="md:hidden text-[11px] font-semibold text-stone-400 uppercase">User</span>
                    <span className="text-stone-700 truncate" title={entry.username}>{entry.username || '—'}</span>
                    <span className="md:hidden text-[11px] font-semibold text-stone-400 uppercase">Pass</span>
                    <span className={cx('font-mono truncate', shown ? 'text-stone-900' : 'text-stone-400 tracking-widest')}>
                      {shown ? shown.password : '••••••••••'}
                    </span>
                    {shown?.notes && (
                      <p className="col-span-2 mt-1 text-xs text-stone-600 bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5 whitespace-pre-line">
                        {shown.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-0.5 ml-auto md:w-48 shrink-0">
                    {entry.hasNotes && !shown && <Badge tone={TONES.stone} className="mr-1">Notes</Badge>}
                    <IconButton
                      icon={shown ? EyeOff : Eye}
                      label={shown ? 'Hide password' : 'View password'}
                      onClick={() => (shown ? setRevealed(({ [entry.id]: _, ...rest }) => rest) : reveal(entry))}
                    />
                    <IconButton
                      icon={copied === entry.id ? Check : Copy}
                      label="Copy password"
                      className={copied === entry.id ? 'text-emerald-600' : undefined}
                      onClick={() => copy(entry)}
                    />
                    <IconButton icon={Pencil} label="Edit" onClick={() => openEdit(entry)} />
                    <IconButton icon={Trash} label="Delete" className="hover:text-rose-600 hover:bg-rose-50" onClick={() => remove(entry)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {list.total > 0 && (
          <div className="px-4 py-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-stone-500">Showing {from}–{to} of {list.total}</span>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <IconButton icon={ChevronLeft} label="Previous page" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)} className="disabled:opacity-30" />
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === list.page ? 'page' : undefined}
                  className={cx(
                    'min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition',
                    n === list.page ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {n}
                </button>
              ))}
              <IconButton icon={ChevronRight} label="Next page" disabled={list.page >= list.pages} onClick={() => setPage(list.page + 1)} className="disabled:opacity-30" />
            </nav>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 justify-end mt-4">
        <Button variant="ghost" icon={KeyRound} onClick={() => setModal('pin')}>Change PIN</Button>
        <Button variant="ghost" onClick={() => setModal('reset')}>Forgot PIN? Reset vault</Button>
      </div>

      {notice && (
        <div
          role="status"
          className={cx(
            'fixed bottom-5 left-1/2 -translate-x-1/2 z-60 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl',
            notice.tone === 'rose' ? 'bg-rose-600 text-white' : 'bg-stone-900 text-white',
          )}
        >
          {notice.text}
        </div>
      )}

      <EntryForm open={!!form} entry={form?.entry} secrets={form?.secrets} onSave={save} onClose={() => setForm(null)} />
      <ChangePinModal open={modal === 'pin'} onClose={() => setModal(null)} onChanged={() => { setModal(null); flash('PIN changed'); }} />
      <ResetModal
        open={modal === 'reset'}
        onClose={() => setModal(null)}
        onReset={() => {
          setModal(null);
          clearVaultSession();
          setList({ items: [], page: 1, pages: 1, total: 0 });
          loadStatus();
          flash('Vault deleted. Create a new PIN.');
        }}
      />
      {/* Rendered last so it stacks above the entry form when saving asks for the PIN. */}
      <UnlockModal
        open={!!unlockPrompt}
        reason={unlockPrompt?.reason}
        onUnlocked={() => {
          unlockPrompt?.resolve(true);
          setUnlockPrompt(null);
          setStatus((s) => ({ ...s, lockedUntil: null }));
        }}
        onClose={() => {
          unlockPrompt?.resolve(false);
          setUnlockPrompt(null);
          loadStatus(); // refresh lockout banner
        }}
      />
    </>
  );
}
