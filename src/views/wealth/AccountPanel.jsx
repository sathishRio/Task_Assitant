import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Mail, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { wealthApi } from '../../api';
import { Badge, Button, EmptyState, IconButton, Modal, cx, inputClass, selectClass } from '../../ui';
import { TONES } from '../../theme';
import { todayStr } from '../../dates';
import { EXCLUDED_TAGS, formatMoney, formatMonth, linksOf, merchantKey, monthOf, thisMonth } from './calc';

const PAGE_SIZE = 15;

// Bank accounts and credit cards: "asset:<id>" / "liability:<id>", the form the server uses.
export const accountRef = (kind, item) => `${kind}:${item.id}`;

// Reads a picked file as base64 (without the data: prefix).
const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });

// Each tag gets a steady colour (same tag, same colour) for the read-only badge.
const TAG_TONES = ['sky', 'indigo', 'teal', 'amber', 'purple', 'rose', 'blue', 'orange', 'pink', 'emerald'].map((k) => TONES[k]);
const tagTone = (tag) => {
  if (EXCLUDED_TAGS.includes(tag)) return TONES.stone;
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_TONES[h % TAG_TONES.length];
};

const formatDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Tag dropdown for one line: the expense (money out) or income (money in) categories, plus the
// tags that are not counted as income or expenses.
// Checklist of the fixed items and loan EMIs a line pays (one or several): their planned amounts that
// month are replaced by it.
function LinkChecks({ value, direction, data, onChange }) {
  const fixed = (data.fixed || []).filter((f) => f.kind === (direction === 'in' ? 'income' : 'expense'));
  const loans = direction === 'out' ? (data.liabilities || []).filter((l) => l.emi > 0) : [];
  const groups = [
    ['Fixed items', fixed.map((f) => [`fixed:${f.id}`, f.note || f.category])],
    ['Loan EMIs', loans.map((l) => [`liability:${l.id}`, l.name])],
  ].filter(([, items]) => items.length);
  if (!groups.length) return <p className="text-xs text-stone-500">No fixed {direction === 'in' ? 'income' : 'expenses or loan EMIs'} to link to.</p>;
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="rounded-xl border border-stone-200 p-2 space-y-2">
      {groups.map(([label, items]) => (
        <div key={label}>
          <div className="px-1 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
          {items.map(([key, name]) => (
            <label key={key} className="flex items-center gap-2 px-1 py-1 rounded text-sm text-ink hover:bg-stone-50 cursor-pointer">
              <input type="checkbox" className="accent-sky-600" checked={value.includes(key)} onChange={() => toggle(key)} />
              <span className="truncate">{name}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// Debit / credit, description and date of a line added by hand.
function EntryDetails({ form, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Type">
        {[['out', 'Debit', 'Money out', 'border-rose-400 bg-rose-50 text-rose-800'], ['in', 'Credit', 'Money in', 'border-emerald-500 bg-emerald-50 text-emerald-800']].map(([value, label, hint, on]) => (
          <button
            key={value}
            type="button"
            aria-pressed={form.direction === value}
            onClick={() => set({ direction: value })}
            className={cx('rounded-xl border p-2 text-sm font-semibold', form.direction === value ? on : 'border-stone-200 text-stone-600 hover:bg-stone-50')}
          >
            {label}
            <span className="block text-[11px] font-normal">{hint}</span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="block text-xs font-semibold text-stone-700 mb-1">Description</span>
        <input autoFocus maxLength={200} className={inputClass} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Sent to landlord" />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-stone-700 mb-1">Date</span>
        <input type="date" className={inputClass} value={form.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
    </>
  );
}

// Popup to add a credit or debit by hand. It counts straight away; a later statement maps to it.
function AddEntry({ open, currency, categoryLists, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(open ? { direction: 'out', description: '', date: todayStr(), amount: '', category: 'Transfer' } : null), [open]);
  if (!open || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const amount = Math.round(Number(String(form.amount).replace(/,/g, '')) * 100) / 100;
  const valid = amount > 0 && form.description.trim() && form.date;
  const save = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    await onSave({ direction: form.direction, description: form.description.trim(), date: form.date, amount, category: form.category });
    setBusy(false);
  };
  return (
    <Modal
      open
      title="Add transfer"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-entry" disabled={busy || !valid}>{busy ? 'Adding…' : 'Add'}</Button>
        </>
      }
    >
      <form id="add-entry" className="space-y-4" onSubmit={save}>
        <EntryDetails form={form} set={set} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-stone-700 mb-1">Amount ({currency})</span>
            <input inputMode="decimal" className={cx(inputClass, 'tabular-nums')} value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-stone-700 mb-1">Tag</span>
            <TagSelect value={form.category} direction={form.direction} categoryLists={categoryLists} onChange={(category) => set({ category })} wide />
          </label>
        </div>
        <p className="text-xs text-stone-500">When you import a statement, the line with the same amount within a week replaces this one. You can change the mapping before importing.</p>
      </form>
    </Modal>
  );
}

// Popup to edit one line: amount, tag, what it pays, and whether it came out of the hold.
function TxnEditor({ txn, isCard, data, categoryLists, fmt, onSave, onTag, onDelete, onClose }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setForm(txn && { amount: String(txn.amount), category: txn.category || '', linkTo: linksOf(txn), fromHold: !!txn.fromHold, description: txn.description, date: txn.date, direction: txn.direction }),
    [txn],
  );
  if (!txn || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const amount = Math.round(Number(String(form.amount).replace(/,/g, '')) * 100) / 100;
  // Lines added by hand can be fully corrected; statement lines keep what the bank printed.
  const manual = txn.source === 'manual';
  const valid = amount > 0 && form.description.trim() && form.date;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await onSave({
      amount,
      linkTo: form.linkTo,
      fromHold: !isCard && form.direction === 'out' && form.fromHold,
      ...(manual ? { description: form.description.trim(), date: form.date, direction: form.direction } : {}),
    });
    if (ok && form.category !== (txn.category || '')) await onTag(form.category);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      title="Edit transaction"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="ghost" icon={Trash2} onClick={onDelete} className="text-rose-700">Delete</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      }
    >
      {manual ? (
        <EntryDetails form={form} set={(patch) => set(patch.direction ? { ...patch, linkTo: [] } : patch)} />
      ) : (
        <div>
          <div className="text-sm font-semibold text-ink">{txn.description}</div>
          <div className="text-xs text-stone-500">{formatDay(txn.date)} · {txn.direction === 'in' ? 'Money in' : 'Money out'}</div>
          {txn.note && <div className="text-xs text-stone-500">Added as: {txn.note}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs font-semibold text-stone-700 mb-1">Amount ({txn.currency})</span>
          <input inputMode="decimal" className={cx(inputClass, 'tabular-nums')} value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-stone-700 mb-1">Tag</span>
          <TagSelect value={form.category} direction={form.direction} categoryLists={categoryLists} onChange={(category) => set({ category })} wide />
        </label>
      </div>
      <div>
        <span className="block text-xs font-semibold text-stone-700 mb-1">Pays (replaces the planned amount this month)</span>
        <LinkChecks value={form.linkTo} direction={form.direction} data={data} onChange={(linkTo) => set({ linkTo })} />
      </div>
      {!isCard && form.direction === 'out' && (
        <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-amber-600" checked={form.fromHold} onChange={(e) => set({ fromHold: e.target.checked })} />
          <span>
            <span className="flex items-center gap-1 text-sm font-semibold text-ink"><Lock className="w-3.5 h-3.5" />Paid from hold</span>
            <span className="block text-xs text-stone-500">Takes this amount off the account's hold this month.</span>
          </span>
        </label>
      )}
    </Modal>
  );
}

// Names of what a line is linked to (items deleted since are left out).
const linkNames = (data, t) =>
  linksOf(t)
    .map((l) => {
      const [kind, id] = l.split(':');
      const f = kind === 'fixed' && data.fixed?.find((x) => x.id === id);
      return f ? f.note || f.category : kind === 'liability' ? data.liabilities?.find((x) => x.id === id)?.name : '';
    })
    .filter(Boolean);

function TagSelect({ value, direction, categoryLists, onChange, disabled, wide }) {
  const own = direction === 'in' ? [...categoryLists.income, 'Cashback'] : categoryLists.expense;
  const options = [...new Set([...own, ...(value && !own.includes(value) && !EXCLUDED_TAGS.includes(value) ? [value] : [])])];
  return (
    <select
      className={cx(selectClass, wide ? 'w-full' : 'py-1! text-xs! max-w-40', !value && 'text-amber-700! border-amber-300!')}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Tag"
    >
      <option value="">Untagged</option>
      <optgroup label={direction === 'in' ? 'Income' : 'Expense'}>
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </optgroup>
      <optgroup label="Not counted">
        {EXCLUDED_TAGS.map((c) => <option key={c} value={c}>{c}</option>)}
      </optgroup>
    </select>
  );
}

/* ---------- Upload ---------- */

function UploadStatement({ w, account, manual, categoryLists, onDone }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null); // { name, data }
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPassword('');
    setNeedsPassword(false);
    setPreview(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const parse = async (f = file, pw = password) => {
    setBusy(true);
    setError('');
    try {
      const result = await w.raw((t) => wealthApi.parseStatement(t, { account, file: f.data, password: pw }));
      if (result) setPreview(result);
    } catch (e) {
      if (e.data?.needsPassword) setNeedsPassword(true);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.size > 10 * 1024 * 1024) return setError('That file is over 10 MB');
    const f = { name: picked.name, data: await readBase64(picked) };
    setFile(f);
    setPreview(null);
    setNeedsPassword(false);
    parse(f, '');
  };

  const setLine = (i, patch) => setPreview((p) => ({ ...p, transactions: p.transactions.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const fresh = preview?.transactions.filter((t) => !t.duplicate) || [];
  const mapped = fresh.filter((t) => t.match).length;
  // Lines added by hand this statement line could replace: same way, not taken by another line.
  const candidates = (line) => manual.filter((m) => m.direction === line.direction && (m.id === line.match?.id || !fresh.some((t) => t.match?.id === m.id)));
  const mapTo = (i, line, id) => {
    const m = manual.find((x) => x.id === id);
    setLine(i, { match: m ? { id: m.id, date: m.date, description: m.description, amount: m.amount, category: m.category } : null, category: m?.category || line.category });
  };

  const save = async () => {
    setBusy(true);
    const r = await w.call((t) =>
      wealthApi.importTransactions(t, { account, transactions: fresh.map((x) => ({ ...x, match: x.match?.id ?? null })), to: preview.to, closing: preview.closing }),
    );
    setBusy(false);
    if (!r) return;
    w.merge('transactions', [...r.created, ...r.matched]);
    if (r.account) w.merge(r.account.kind, [r.account.item]);
    reset();
    onDone(`${r.created.length} transaction${r.created.length === 1 ? '' : 's'} imported${r.matched.length ? `, ${r.matched.length} mapped to transfers you added` : ''}${r.duplicates ? `, ${r.duplicates} already there` : ''}.`);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={pick} />
      <Button variant="soft" icon={Upload} disabled={busy} onClick={() => inputRef.current?.click()}>
        Upload statement
      </Button>
      {(file || error) && !preview && (
        <div className="basis-full rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2">
          {file && <p className="text-xs text-stone-600">{busy ? `Reading ${file.name}…` : file.name}</p>}
          {error && !needsPassword && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <button type="button" className="text-xs text-stone-500 underline" onClick={reset}>Cancel</button>
        </div>
      )}
      <Modal
        open={needsPassword && !preview}
        title="Password protected PDF"
        onClose={reset}
        footer={
          <>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button type="submit" form="statement-password" disabled={!password || busy}>{busy ? 'Opening…' : 'Open'}</Button>
          </>
        }
      >
        <form
          id="statement-password"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) parse();
          }}
        >
          <p className="text-xs text-stone-600">{file?.name} is locked. Enter its password to read it.</p>
          <input
            type="password"
            autoFocus
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Statement password"
            autoComplete="off"
          />
          {error && password && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </form>
      </Modal>
      <Modal
        open={!!preview}
        wide
        title={`Import ${file?.name || 'statement'}`}
        onClose={reset}
        footer={
          <>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button disabled={(!fresh.length && preview?.closing == null) || busy} onClick={save}>
              {busy ? 'Importing…' : fresh.length ? `Import ${fresh.length}` : 'Update balance'}
            </Button>
          </>
        }
      >
        {preview && (
          <>
            <p className="text-xs text-stone-600">
              {formatDay(preview.from)} – {formatDay(preview.to)} · {preview.transactions.length} lines
              {preview.transactions.length - fresh.length > 0 && ` · ${preview.transactions.length - fresh.length} already imported (greyed out)`}
              {preview.closing != null && ` · closing balance ${preview.closing.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              {mapped > 0 && ` · ${mapped} mapped to transfers you added`}
            </p>
            <div className="divide-y divide-stone-100 -mx-2">
              {preview.transactions.map((t, i) => (
                <div key={t.key} className={cx('px-2 py-1.5 text-xs', t.duplicate && 'opacity-40')}>
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 tabular-nums text-stone-500">{t.date.slice(5).split('-').reverse().join('/')}</span>
                    <span className="flex-1 min-w-0 truncate text-ink">{t.description}</span>
                    <span className={cx('tabular-nums font-semibold', t.direction === 'in' ? 'text-emerald-700' : 'text-ink')}>
                      {t.direction === 'in' ? '+' : '−'}
                      {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {!t.duplicate && <TagSelect value={t.category} direction={t.direction} categoryLists={categoryLists} onChange={(category) => setLine(i, { category })} />}
                  </div>
                  {!t.duplicate && candidates(t).length > 0 && (
                    <label className="mt-1 flex items-center gap-2 pl-22 text-stone-500">
                      Maps to
                      <select className={cx(selectClass, 'py-1! text-xs! min-w-0 flex-1', t.match && 'border-sky-300! text-sky-800!')} value={t.match?.id || ''} onChange={(e) => mapTo(i, t, e.target.value)}>
                        <option value="">Nothing (new line)</option>
                        {candidates(t).map((m) => (
                          <option key={m.id} value={m.id}>
                            {formatDay(m.date)} · {m.description} · {m.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------- Statement emails (Gmail) ---------- */

function StatementEmails({ w, account, sources, gmail, onMessage }) {
  const [edit, setEdit] = useState(null); // source being edited, or {} for a new one
  const [syncing, setSyncing] = useState(false);
  const mine = sources.filter((s) => s.account === account);

  const save = async () => {
    const payload = { account, subject: edit.subject?.trim() || '', sender: edit.sender?.trim() || '', password: edit.password || '' };
    if (!payload.subject) return;
    const ok = edit.id ? await w.update('sources', edit.id)(payload) : await w.create('sources')(payload);
    if (ok) setEdit(null);
  };

  const sync = async () => {
    setSyncing(true);
    const all = [];
    for (const s of mine) {
      const r = await w.call((t) => wealthApi.gmailSync(t, s.id));
      if (!r) break;
      w.merge('transactions', r.created);
      w.merge('sources', r.results.map((x) => x.source));
      for (const a of r.accounts) w.merge(a.kind, [a.item]);
      all.push(...r.results);
    }
    setSyncing(false);
    const imported = all.reduce((n, r) => n + r.imported, 0);
    const errors = all.flatMap((r) => r.errors);
    onMessage(errors.length ? `${imported} imported. ${errors[0]}` : `Gmail: ${imported} new transaction${imported === 1 ? '' : 's'}.`);
  };

  return (
    <div className="rounded-xl border border-stone-200 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Mail className="w-4 h-4" /> Statement emails
        </span>
        <div className="flex gap-1">
          {mine.length > 0 && gmail?.connected && (
            <Button variant="soft" icon={RefreshCw} disabled={syncing} onClick={sync}>
              {syncing ? 'Syncing…' : 'Sync from Gmail'}
            </Button>
          )}
          <Button variant="ghost" icon={Plus} onClick={() => setEdit({})}>Subject</Button>
        </div>
      </div>
      {!gmail?.connected && <p className="text-xs text-stone-500">Connect Gmail in the Accounts section to fetch statements automatically.</p>}
      {mine.map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 min-w-0">
            <span className="block truncate text-ink">“{s.subject}”{s.sender && <span className="text-stone-500"> from {s.sender}</span>}</span>
            <span className="block text-stone-500">
              {s.password ? 'Password saved · ' : ''}
              {s.lastSync ? `Synced ${new Date(s.lastSync).toLocaleString()} · ${s.lastResult}` : 'Not synced yet'}
            </span>
          </span>
          <IconButton icon={Pencil} label="Edit" onClick={() => setEdit(s)} />
          <IconButton icon={Trash2} label="Remove" onClick={() => window.confirm('Remove this statement email?') && w.remove('sources', s.id)()} />
        </div>
      ))}
      {edit && (
        <form
          className="grid sm:grid-cols-3 gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input autoFocus className={inputClass} value={edit.subject || ''} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} placeholder="Mail subject" />
          <input className={inputClass} value={edit.sender || ''} onChange={(e) => setEdit({ ...edit, sender: e.target.value })} placeholder="From (optional)" />
          <input
            type="password"
            className={inputClass}
            value={edit.password || ''}
            onChange={(e) => setEdit({ ...edit, password: e.target.value })}
            placeholder="PDF password (optional)"
            autoComplete="off"
          />
          <div className="sm:col-span-3 flex gap-2">
            <Button type="submit" disabled={!edit.subject?.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------- Panel ---------- */

// Right-side panel (half the screen) with one account's or card's transactions.
export function AccountPanel({ w, data, open, categoryLists, gmail, onClose }) {
  const [month, setMonth] = useState(thisMonth);
  const [untagged, setUntagged] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [similar, setSimilar] = useState(null); // { txn, category, count }
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // the line open in the edit popup
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setMonth(thisMonth());
    setUntagged(false);
    setPage(0);
    setMessage('');
    setSimilar(null);
    setEditing(null);
    setAdding(false);
  }, [open?.ref]);
  useEffect(() => setPage(0), [month, untagged]);

  const all = useMemo(() => (open ? data.transactions.filter((t) => t.account === open.ref) : []), [data.transactions, open]);
  const months = useMemo(() => [...new Set([thisMonth(), ...all.map((t) => monthOf(t.date))])].sort().reverse(), [all]);
  const shown = all
    .filter((t) => (!month || monthOf(t.date) === month) && (!untagged || !t.category))
    .sort((a, b) => b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const byDay = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).reduce((m, t) => m.set(t.date, [...(m.get(t.date) || []), t]), new Map());
  const out = shown.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0);
  const inn = shown.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
  const untaggedCount = all.filter((t) => !t.category).length;

  // Deletes imported lines (e.g. a wrong import); importing the statement again brings them back.
  const removeTxns = async (list) => {
    const n = list.length;
    const handAdded = list.filter((t) => t.source === 'manual').length;
    const warning = handAdded === n ? 'This cannot be undone.' : `You can import the statement again to bring ${n === 1 ? 'it' : 'them'} back${handAdded ? `, except ${handAdded} you added by hand` : ''}.`;
    if (!n || !window.confirm(`Delete ${n === 1 ? 'this transaction' : `${n} transactions`}? ${warning}`)) return;
    setBusyId('clear');
    let done = 0;
    for (const t of list) if (await w.remove('transactions', t.id)()) done++;
    else break;
    setBusyId(null);
    setMessage(`Deleted ${done} transaction${done === 1 ? '' : 's'}.`);
  };

  if (!open) return null;
  const { item, ref } = open;
  const isCard = ref.startsWith('liability:');
  const fmt = (x) => formatMoney(x, item.currency);
  // Opening balance of the picked month: today's balance with every movement since the 1st undone.
  const closingNow = isCard ? item.outstanding : item.balance ?? item.currentValue;
  const since = month ? all.filter((t) => monthOf(t.date) >= month) : [];
  const net = since.reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0);
  const opening = month && closingNow != null ? closingNow + (isCard ? net : -net) : null;

  const addEntry = async (entry) => {
    const created = await w.create('transactions')({ ...entry, account: ref });
    if (!created) return;
    setAdding(false);
    if (month) setMonth(monthOf(created.date)); // keep the new line in view
    setMessage('Transfer added. It will be mapped when you import the statement.');
  };

  const tag = async (txn, category, all = false) => {
    setBusyId(txn.id);
    const changed = await w.call((t) => wealthApi.tagTransaction(t, txn.id, { category, similar: all }));
    setBusyId(null);
    if (!changed) return;
    w.merge('transactions', changed);
    if (all) {
      setSimilar(null);
      setMessage(`Tagged ${changed.length} from ${merchantKey(txn.description)} as ${category}. New imports from it are tagged too.`);
      return;
    }
    const key = merchantKey(txn.description);
    const count = data.transactions.filter((t) => t.id !== txn.id && !t.category && merchantKey(t.description) === key).length;
    setSimilar(category && key ? { txn, category, count } : null);
  };

  return (
    <Modal open side half title={item.name} onClose={onClose}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge tone={isCard ? TONES.rose : TONES.emerald} upper>{isCard ? 'Credit card' : 'Bank account'}</Badge>
          <div className="text-2xl font-bold tabular-nums text-ink mt-1">{fmt(isCard ? item.outstanding : item.balance ?? item.currentValue)}</div>
          <div className="text-xs text-stone-500">
            {isCard ? 'Outstanding' : 'Balance'}
            {item.statementTo && ` · last statement ${formatDay(item.statementTo)}: ${fmt(item.statementBalance)}`}
          </div>
          {opening != null && (
            <div className="text-xs text-stone-600 mt-1">
              Opening balance {formatMonth(month)}: <span className="font-semibold tabular-nums text-ink">{fmt(opening)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" icon={Plus} onClick={() => setAdding(true)}>Add transfer</Button>
          <UploadStatement w={w} account={ref} manual={all.filter((t) => t.source === 'manual')} categoryLists={categoryLists} onDone={setMessage} />
        </div>
      </div>

      {message && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex justify-between gap-2">
          {message}
          <button type="button" onClick={() => setMessage('')} className="text-emerald-700">✕</button>
        </p>
      )}

      <StatementEmails w={w} account={ref} sources={data.sources} gmail={gmail} onMessage={setMessage} />

      <div className="flex flex-wrap items-center gap-2">
        <select className={cx(selectClass, 'py-1.5!')} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
          <input type="checkbox" className="accent-emerald-600" checked={untagged} onChange={(e) => setUntagged(e.target.checked)} />
          Untagged only{untaggedCount > 0 && ` (${untaggedCount})`}
        </label>
      </div>

      {similar && similar.count > 0 && (
        <p className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-900 flex flex-wrap items-center gap-2">
          Tag {similar.count} more from {merchantKey(similar.txn.description)} as {similar.category}, and future ones too?
          <Button variant="soft" onClick={() => tag(similar.txn, similar.category, true)}>Yes, tag all</Button>
          <button type="button" className="underline" onClick={() => setSimilar(null)}>No</button>
        </p>
      )}

      {all.length === 0 ? (
        <EmptyState text="No transactions yet. Add a transfer, upload a statement PDF, or add the statement email subject to fetch it from Gmail." />
      ) : (
        <>
          <div className="flex gap-4 text-xs text-stone-600">
            <span>{shown.length} shown</span>
            <span className="text-ink">Out {fmt(out)}</span>
            <span className="text-emerald-700">In {fmt(inn)}</span>
            {shown.length > 0 && (
              <button type="button" disabled={busyId === 'clear'} onClick={() => removeTxns(shown)} className="ml-auto flex items-center gap-1 font-semibold text-rose-700 hover:underline">
                <Trash2 className="w-3.5 h-3.5" />
                {shown.length === all.length ? 'Clear all' : `Clear ${shown.length} shown`}
              </button>
            )}
          </div>
          <div className="-mx-6 border-t border-stone-200">
            {[...byDay].map(([day, list]) => (
              <div key={day}>
                <div className="px-6 py-1 bg-stone-50 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">{formatDay(day)}</div>
                {list.map((t) => (
                  <button key={t.id} type="button" disabled={busyId === t.id} onClick={() => setEditing(t)} className="w-full text-left px-6 py-2 flex items-center gap-3 border-b border-stone-100 hover:bg-stone-50">
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-ink truncate">{t.description}</span>
                        {t.category ? <Badge tone={tagTone(t.category)} className="shrink-0">{t.category}</Badge> : <Badge tone={TONES.amber} className="shrink-0">Untagged</Badge>}
                      </span>
                      {t.source === 'manual' && <span className="block text-[10.5px] text-stone-500">Added by hand · waiting for the statement</span>}
                      {t.source !== 'manual' && t.note && <span className="block text-[10.5px] text-stone-500 truncate">Added as: {t.note}</span>}
                      {linkNames(data, t).length > 0 && <span className="block text-[10.5px] text-sky-700">Linked to {linkNames(data, t).join(', ')} · replaces the planned amount this month</span>}
                      {t.fromHold && <span className="flex items-center gap-1 text-[10.5px] text-amber-700"><Lock className="w-3 h-3" />Paid from hold</span>}
                      {EXCLUDED_TAGS.includes(t.category) && <span className="text-[10.5px] text-stone-400">Not counted as income or expense</span>}
                    </span>
                    <span className={cx('text-sm font-semibold tabular-nums px-1', t.direction === 'in' ? 'text-emerald-700' : 'text-ink')}>
                      {t.direction === 'in' ? '+' : '−'}
                      {fmt(t.amount)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span>
                {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, shown.length)} of {shown.length}
              </span>
              <div className="flex items-center gap-1">
                <IconButton icon={ChevronLeft} label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} />
                <span className="tabular-nums">Page {current + 1} / {pages}</span>
                <IconButton icon={ChevronRight} label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} />
              </div>
            </div>
          )}
        </>
      )}
      <AddEntry open={adding} currency={item.currency} categoryLists={categoryLists} onSave={addEntry} onClose={() => setAdding(false)} />
      <TxnEditor
        txn={editing}
        isCard={isCard}
        data={data}
        categoryLists={categoryLists}
        fmt={fmt}
        onSave={(patch) => w.update('transactions', editing.id)(patch)}
        onTag={(category) => tag(editing, category)}
        onDelete={async () => {
          await removeTxns([editing]);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </Modal>
  );
}

/* ---------- Gmail connection ---------- */

let gsiPromise;
const loadGoogleScript = () =>
  (gsiPromise ||= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  }));

// Gmail status for the Accounts section, and the connect flow (Google popup → one-time code → server).
export function useGmail(w) {
  const [gmail, setGmail] = useState(null);
  useEffect(() => {
    w.raw((t) => wealthApi.gmailStatus(t)).then(setGmail, () => setGmail({ configured: false, connected: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    await loadGoogleScript();
    const code = await new Promise((resolve) => {
      window.google.accounts.oauth2
        .initCodeClient({
          client_id: gmail.clientId,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          ux_mode: 'popup',
          callback: (r) => resolve(r.code || null),
          error_callback: () => resolve(null),
        })
        .requestCode();
    });
    if (!code) return;
    const r = await w.call((t) => wealthApi.gmailConnect(t, code));
    if (r) setGmail((g) => ({ ...g, ...r }));
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail? Statements will no longer be fetched.')) return;
    const ok = await w.call((t) => wealthApi.gmailDisconnect(t).then(() => true));
    if (ok) setGmail((g) => ({ ...g, connected: false, email: '' }));
  };
  return { gmail, connect, disconnect };
}
