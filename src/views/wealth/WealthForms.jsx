import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { FormModal } from '../../forms';
import { todayStr } from '../../dates';
import { Button, Field, IconButton, cx, inputClass } from '../../ui';
import {
  ASSET_TYPES, COMPOUNDING, GOAL_TYPES, LIABILITY_TYPES,
  FREQUENCIES, GOLD_PURITY, convert, netFlows, debtStatus, fdMaturity, fixedAmount, formatMoney, isFd, loanPlan, formatDay, thisMonth,
} from './calc';

// Add / edit forms for the Wealth page. Each takes `record` (null = new), `defaults`, and
// `onSave(data)` / `onDelete()` that resolve truthy on success.

const num = (v) => (v === '' || v == null ? 0 : Number(v));
const confirmDelete = (what) => window.confirm(`Delete ${what}? This cannot be undone.`);

function useForm(open, record, empty) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setForm(record ? { ...empty, ...record } : empty);
    setError('');
    // `empty` is rebuilt every render; read once per opening on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);
  return [form, (patch) => setForm((f) => ({ ...f, ...patch })), error, setError];
}

function Money({ label, value, onChange, step = '0.01', suffix }) {
  return (
    <Field label={label}>
      <div className="relative">
        <input type="number" min="0" step={step} inputMode="decimal" className={cx(inputClass, suffix && 'pr-20')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-400 pointer-events-none">{suffix}</span>}
      </div>
    </Field>
  );
}

function CurrencySelect({ value, onChange, currencies }) {
  return (
    <Field label="Currency">
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </Field>
  );
}

const Select = ({ label, value, onChange, options }) => (
  <Field label={label}>
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  </Field>
);

// Category dropdown; "Custom…" switches to a text box for a name not in the list.
// Bank account an item is paid into or out of. Empty = not linked, so no balance changes.
function AccountSelect({ label = 'Account', value, onChange, accounts, none = 'Not linked' }) {
  if (!accounts?.length) return null;
  return (
    <Select
      label={label}
      value={value || ''}
      onChange={onChange}
      options={[...(none ? [{ key: '', label: none }] : []), ...accounts.map((a) => ({ key: a.id, label: a.name }))]}
    />
  );
}

function CategorySelect({ label = 'Category', value, onChange, categories, autoFocus }) {
  const [custom, setCustom] = useState(false);
  const known = categories.includes(value);
  if (custom || (value && !known)) {
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <input autoFocus={autoFocus || custom} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Category name" />
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-stone-500 hover:text-ink"
            onClick={() => {
              setCustom(false);
              onChange(categories[0]);
            }}
          >
            List
          </button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <select
        autoFocus={autoFocus}
        className={inputClass}
        value={known ? value : ''}
        onChange={(e) => {
          if (e.target.value === '__custom') {
            setCustom(true);
            onChange('');
          } else onChange(e.target.value);
        }}
      >
        {!known && <option value="" disabled>Pick a category</option>}
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__custom">Custom…</option>
      </select>
    </Field>
  );
}

const Calc = ({ children }) => (
  <div className="rounded-xl border-[1.5px] border-dashed border-stone-300 bg-stone-50 px-3.5 py-2.5 text-xs text-stone-600 space-y-0.5">{children}</div>
);

/* ---------- Asset ---------- */

export function AssetForm({ open, record, currencies, defaultCurrency, goldPrice, rates, refreshGold, onSave, onDelete, onClose }) {
  const empty = {
    name: '', type: 'bank', currency: defaultCurrency, principal: '', currentValue: '', interestRate: '',
    compounding: 'quarterly', startDate: '', maturityDate: '', flows: [], grams: '', purity: '24K', reserved: false, reservedAmount: '', holdAmount: '', balanceMonth: '', openingDate: '', notes: '',
  };
  const [form, set, error, setError] = useForm(open, record, empty);
  const fd = isFd(form);
  const hasGrams = form.type === 'gold' || form.type === 'other';
  const totalGrams = num(form.grams) + form.flows.reduce((t, f) => t + (f.kind === 'withdrawal' ? -1 : 1) * num(f.grams), 0);
  // Gold: live rate per gram for the chosen purity, in the asset's currency; value = total grams × rate.
  const gold = form.type === 'gold';
  const realEstate = form.type === 'real_estate';
  const [livePrice, setLivePrice] = useState(goldPrice);
  useEffect(() => setLivePrice(goldPrice), [goldPrice]);
  useEffect(() => {
    if (!open || !gold || !refreshGold) return undefined;
    refreshGold().then((p) => p && setLivePrice(p));
    const t = setInterval(() => refreshGold().then((p) => p && setLivePrice(p)), 60 * 1000);
    return () => clearInterval(t);
  }, [open, gold, refreshGold]);
  const ratePerGram = gold && livePrice?.aedPerGram24
    ? convert(livePrice.aedPerGram24 * (GOLD_PURITY[form.purity] ?? 1), 'AED', form.currency, rates)
    : null;
  const goldAuto = gold && ratePerGram > 0 && totalGrams > 0;
  const goldValue = goldAuto ? totalGrams * ratePerGram : null;
  const hasRate = fd || form.type === 'bank' || form.type === 'other';
  const preview = fd && { ...form, principal: num(form.principal), interestRate: num(form.interestRate) };
  const maturity = preview && fdMaturity(preview);

  const setFlow = (i, patch) => set({ flows: form.flows.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const save = async () => {
    const name = form.name.trim();
    if (!name) return setError('Give the asset a name'), false;
    if (fd && (!form.startDate || !form.maturityDate)) return setError('A fixed deposit needs a start and maturity date'), false;
    if (fd && form.maturityDate <= form.startDate) return setError('Maturity must be after the start date'), false;
    if (form.flows.some((f) => !f.date || !(num(f.amount) > 0))) return setError('Each contribution or withdrawal needs a date and amount'), false;
    return onSave({
      name, type: form.type, currency: form.currency, reserved: !!form.reserved, notes: form.notes.trim(),
      reservedAmount: form.reserved ? 0 : num(form.reservedAmount),
      holdAmount: form.type === 'bank' ? num(form.holdAmount) : 0,
      balanceMonth: '',
      openingDate: form.type === 'bank' ? form.openingDate || null : null,
      principal: num(form.principal),
      grams: hasGrams ? num(form.grams) : 0,
      purity: form.purity || '24K',
      currentValue: fd ? 0 : goldAuto ? Math.round(goldValue * 100) / 100 : num(form.currentValue),
      interestRate: num(form.interestRate),
      compounding: form.compounding,
      startDate: form.startDate || null,
      maturityDate: form.maturityDate || null,
      flows: form.flows.map(({ date, kind, amount, grams, growth, note }) => ({ date, kind, amount: num(amount), grams: hasGrams ? num(grams) : 0, growth: realEstate && kind === 'contribution' ? Number(growth) || 0 : 0, note: note || '' })),
    });
  };

  return (
    <FormModal
      open={open}
      wide
      title={record ? 'Edit Asset' : 'Add Asset'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Asset"
      onDelete={record && (async () => confirmDelete(`"${record.name}"`) && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input autoFocus className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Emirates NBD savings" />
        </Field>
        <Select label="Type" value={form.type} onChange={(type) => set({ type })} options={ASSET_TYPES} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Money label={fd ? 'Deposit amount' : 'Amount put in'} value={form.principal} onChange={(principal) => set({ principal })} />
        {!fd && !goldAuto && (
          <Money
            label={form.type === 'bank' ? 'Opening balance' : form.type === 'gold' ? 'Current value (if no live rate)' : form.type === 'real_estate' ? 'Property value (before contributions)' : 'Current value'}
            value={form.currentValue}
            onChange={(currentValue) => set({ currentValue })}
          />
        )}
        {form.type === 'gold' && (
          <Select label="Purity" value={form.purity || '24K'} onChange={(purity) => set({ purity })} options={[{ key: '24K', label: '24K' }, { key: '22K', label: '22K' }]} />
        )}
        {hasGrams && <Money label="Grams (first purchase)" step="0.001" value={form.grams ?? ''} onChange={(grams) => set({ grams })} suffix="g" />}
        {hasGrams && (
          <Field label="Total grams">
            <div className={cx(inputClass, 'bg-stone-50 font-semibold text-ink tabular-nums')} aria-live="polite">
              {+totalGrams.toFixed(3)} g
            </div>
          </Field>
        )}
        {hasRate && <Money label="Interest rate" value={form.interestRate} onChange={(interestRate) => set({ interestRate })} suffix="% / yr" />}
      </div>
      {form.type === 'real_estate' && form.flows.length > 0 && (
        <Calc>
          Current value{' '}
          <b className="text-ink">
            {formatMoney(Math.max(0, num(form.currentValue) + netFlows({ flows: form.flows.map((f) => ({ ...f, amount: num(f.amount), growth: Number(f.growth) || 0 })) })), form.currency)}
          </b>{' '}
          = property value + each contribution × (1 + its value increase %) − withdrawals.
        </Calc>
      )}
      {gold && (
        <Calc>
          {ratePerGram > 0 ? (
            <>
              <div>
                Live {form.purity || '24K'} rate <b className="text-ink">{formatMoney(ratePerGram, form.currency)} / g</b>
                {livePrice?.updatedAt && <span className="text-stone-400"> · updated {new Date(livePrice.updatedAt).toLocaleTimeString()}</span>}
              </div>
              {goldAuto ? (
                <div>
                  Current value <b className="text-ink">{formatMoney(goldValue, form.currency)}</b> = {+totalGrams.toFixed(3)} g × rate, updated automatically.
                </div>
              ) : (
                <div>Enter grams to calculate the current value automatically.</div>
              )}
            </>
          ) : (
            <div>Live gold rate unavailable right now; enter the current value by hand.</div>
          )}
        </Calc>
      )}
      {fd && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Compounding" value={form.compounding} onChange={(compounding) => set({ compounding })} options={COMPOUNDING} />
            <Field label="Start date">
              <input type="date" className={inputClass} value={form.startDate || ''} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label="Maturity date">
              <input type="date" className={inputClass} value={form.maturityDate || ''} onChange={(e) => set({ maturityDate: e.target.value })} />
            </Field>
          </div>
          {maturity && (
            <Calc>
              <div>
                Maturity value <b className="text-ink">{formatMoney(maturity.value, form.currency)}</b> · interest{' '}
                <b className="text-ink">{formatMoney(maturity.interest, form.currency)}</b>
              </div>
              <div>
                {form.compounding === 'simple' ? 'P × (1 + r × t)' : 'P × (1 + r/n)^(n × t)'}, t = years from start to maturity. Its value today
                accrues the same way, so net worth needs no manual update.
              </div>
            </Calc>
          )}
        </>
      )}
      {!fd && form.type !== 'bank' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Contributions & withdrawals</span>
            <Button variant="ghost" icon={Plus} onClick={() => set({ flows: [...form.flows, { date: todayStr(), kind: 'contribution', amount: '', grams: '', note: '' }] })}>
              Add
            </Button>
          </div>
          {form.flows.length === 0 ? (
            <p className="text-xs text-stone-400">Money added or taken out after the first investment. Return = current value − (amount put in + contributions − withdrawals).</p>
          ) : (
            <div className="space-y-2">
              {form.flows.map((f, i) => (
                <div key={f.id || i} className={`grid grid-cols-[1fr_1fr] ${hasGrams || realEstate ? 'sm:grid-cols-[9rem_8rem_1fr_6rem_1fr_auto]' : 'sm:grid-cols-[9rem_8rem_1fr_1fr_auto]'} gap-2 items-center`}>
                  <input type="date" className={inputClass} value={f.date} onChange={(e) => setFlow(i, { date: e.target.value })} aria-label="Date" />
                  <select className={inputClass} value={f.kind} onChange={(e) => setFlow(i, { kind: e.target.value })} aria-label="Kind">
                    <option value="contribution">Added</option>
                    <option value="withdrawal">Withdrawn</option>
                  </select>
                  <input type="number" min="0" step="0.01" className={inputClass} value={f.amount} onChange={(e) => setFlow(i, { amount: e.target.value, autoAmount: false })} placeholder="Amount" aria-label="Amount" />
                  {realEstate && (
                    <input
                      type="number" step="0.1" className={inputClass} value={f.kind === 'contribution' ? f.growth ?? '' : ''} disabled={f.kind !== 'contribution'}
                      onChange={(e) => setFlow(i, { growth: e.target.value })} placeholder="Value +%" aria-label="Value increase %" title="How much this contribution raised the property value, in % of its amount"
                    />
                  )}
                  {hasGrams && (
                    <input type="number" min="0" step="0.001" className={inputClass} value={f.grams ?? ''} onChange={(e) => setFlow(i, { grams: e.target.value, ...(ratePerGram > 0 && (f.autoAmount || !f.amount) ? { amount: e.target.value ? String(Math.round(num(e.target.value) * ratePerGram * 100) / 100) : '', autoAmount: true } : {}) })} placeholder="Grams" aria-label="Grams" />
                  )}
                  <input className={inputClass} value={f.note} onChange={(e) => setFlow(i, { note: e.target.value })} placeholder="Note" aria-label="Note" />
                  <IconButton icon={Trash} label="Remove" onClick={() => set({ flows: form.flows.filter((_, j) => j !== i) })} />
                </div>
              ))}
            </div>
          )}
          {hasGrams && totalGrams > 0 && (
            <p className="mt-2 text-xs text-stone-600">
              Total held <b className="text-ink">{+totalGrams.toFixed(3)} g</b>
            </p>
          )}
        </div>
      )}
      {form.type === 'bank' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Opening balance on">
            <input type="date" className={inputClass} value={form.openingDate || ''} onChange={(e) => set({ openingDate: e.target.value })} />
          </Field>
          {!form.reserved && <Money label="Saved for later payment" value={form.reservedAmount ?? ''} onChange={(reservedAmount) => set({ reservedAmount })} />}
          <Money label="Default hold amount" value={form.holdAmount ?? ''} onChange={(holdAmount) => set({ holdAmount })} />
          <p className="sm:col-span-2 -mt-2 text-xs text-stone-500">
            Balance = opening balance + money in − money out of every imported statement line from this date (all lines when empty).
            “Saved for later” is kept out of the balance shown, total assets and net worth.
            “Default hold” is always on hold; fixed expenses paid from this account are added to it each month.
          </p>
        </div>
      )}
      <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.reserved} onChange={(e) => set({ reserved: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Set aside for a bill</span>
          <span className="block text-xs text-stone-500">Money saved up for an upcoming payment. Not counted in net worth or the emergency fund.</span>
        </span>
      </label>
      <Field label="Notes">
        <textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Liability ---------- */

export function LiabilityForm({ open, record, currencies, defaultCurrency, accounts, onSave, onDelete, onClose }) {
  const empty = {
    name: '', type: 'personal_loan', currency: defaultCurrency, outstanding: '', interestRate: '', emi: '',
    remainingMonths: '', nextPaymentDate: '', accountId: '', openingDate: '', notes: '',
  };
  // Cards with imported lines show a running outstanding; the form edits the opening one.
  const opening = useMemo(() => record && { ...record, outstanding: record.openingOutstanding ?? record.outstanding }, [record]);
  const [form, set, error, setError] = useForm(open, opening, empty);
  const card = form.type === 'credit_card';
  const plan = loanPlan({ outstanding: num(form.outstanding), interestRate: num(form.interestRate), emi: num(form.emi), nextPaymentDate: form.nextPaymentDate || null });

  const save = async () => {
    const name = form.name.trim();
    if (!name) return setError('Give the liability a name'), false;
    return onSave({
      name, type: form.type, currency: form.currency, accountId: form.accountId || '', notes: form.notes.trim(),
      outstanding: num(form.outstanding), interestRate: num(form.interestRate), emi: num(form.emi),
      remainingMonths: form.remainingMonths === '' || form.remainingMonths == null ? null : num(form.remainingMonths),
      nextPaymentDate: form.nextPaymentDate || null,
      openingDate: card ? form.openingDate || null : null,
    });
  };

  return (
    <FormModal
      open={open}
      title={record ? 'Edit Liability' : 'Add Liability'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Liability"
      onDelete={record && (async () => confirmDelete(`"${record.name}"`) && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input autoFocus className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Car loan – ADCB" />
        </Field>
        <Select label="Type" value={form.type} onChange={(type) => set({ type })} options={LIABILITY_TYPES} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Money label={card ? 'Opening outstanding' : 'Outstanding principal'} value={form.outstanding} onChange={(outstanding) => set({ outstanding })} />
        {card && (
          <Field label="Opening outstanding on">
            <input type="date" className={inputClass} value={form.openingDate || ''} onChange={(e) => set({ openingDate: e.target.value })} />
          </Field>
        )}
        <Money label="Interest rate" value={form.interestRate} onChange={(interestRate) => set({ interestRate })} suffix="% / yr" />
        <Money label={form.type === 'credit_card' ? 'Monthly payment' : 'EMI'} value={form.emi} onChange={(emi) => set({ emi })} />
        <Money label="Remaining tenure" value={form.remainingMonths} onChange={(remainingMonths) => set({ remainingMonths })} step="1" suffix="months" />
        <Field label="Next payment date">
          <input type="date" className={inputClass} value={form.nextPaymentDate || ''} onChange={(e) => set({ nextPaymentDate: e.target.value })} />
        </Field>
      </div>
      {num(form.outstanding) > 0 && (
        <Calc>
          {Number.isFinite(plan.months) ? (
            <>
              <div>
                Paid off in <b className="text-ink">{plan.payments} payments</b>
                {plan.payoffDate && <> · last payment around <b className="text-ink">{formatDay(plan.payoffDate)}</b></>} · interest still to pay ≈{' '}
                <b className="text-ink">{formatMoney(plan.interest, form.currency)}</b>
              </div>
              <div>n = −ln(1 − i·B/EMI) ÷ ln(1 + i), with i = yearly rate ÷ 12 and B = outstanding.</div>
            </>
          ) : num(form.emi) > 0 ? (
            <div className="text-rose-700">The payment doesn't cover the monthly interest, so this balance never clears at this rate.</div>
          ) : (
            <div>Enter the monthly payment to estimate when this is paid off.</div>
          )}
        </Calc>
      )}
      <AccountSelect label="EMI paid from" value={form.accountId} onChange={(accountId) => set({ accountId })} accounts={accounts} />
      <Field label="Notes">
        <textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Money lent / borrowed ---------- */

export function DebtForm({ open, record, defaults, currencies, onSave, onDelete, onClose }) {
  const empty = { direction: 'lent', person: '', currency: 'AED', amount: '', date: todayStr(), dueDate: '', repayments: [], note: '', ...defaults };
  const [form, set, error, setError] = useForm(open, record, empty);
  const lent = form.direction === 'lent';
  const status = debtStatus({ amount: num(form.amount), repayments: form.repayments.map((r) => ({ amount: num(r.amount) })) });
  const setRepayment = (i, patch) => set({ repayments: form.repayments.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async () => {
    const person = form.person.trim();
    if (!person) return setError(lent ? 'Who did you lend to?' : 'Who do you owe?'), false;
    if (!(num(form.amount) > 0)) return setError('Enter the amount'), false;
    if (form.repayments.some((r) => !r.date || !(num(r.amount) > 0))) return setError('Each repayment needs a date and amount'), false;
    if (status.repaid > num(form.amount) + 1e-9) return setError('Repayments add up to more than the amount'), false;
    return onSave({
      direction: form.direction, person, currency: form.currency, amount: num(form.amount),
      date: form.date || null, dueDate: form.dueDate || null, note: form.note.trim(),
      repayments: form.repayments.map(({ date, amount, note }) => ({ date, amount: num(amount), note: note || '' })),
    });
  };

  return (
    <FormModal
      open={open}
      wide
      title={`${record ? 'Edit' : 'Add'} ${lent ? 'money lent' : 'money borrowed'}`}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete"
      onDelete={record && (async () => confirmDelete(`this record with ${record.person}`) && (await onDelete()) && onClose())}
    >
      <Select
        label="Type"
        value={form.direction}
        onChange={(direction) => set({ direction })}
        options={[{ key: 'lent', label: 'I lent money (owed to me)' }, { key: 'borrowed', label: 'I borrowed money (I have to pay)' }]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={lent ? 'Lent to' : 'Borrowed from'}>
          <input autoFocus className={inputClass} value={form.person} onChange={(e) => set({ person: e.target.value })} placeholder="Name" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
          <Money label="Amount" value={form.amount} onChange={(amount) => set({ amount })} />
        </div>
        <Field label={lent ? 'Date lent' : 'Date borrowed'}>
          <input type="date" className={inputClass} value={form.date || ''} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Due date (optional)">
          <input type="date" className={inputClass} value={form.dueDate || ''} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">{lent ? 'Paid back to me' : 'Paid back by me'}</span>
          <Button
            variant="ghost"
            icon={Plus}
            onClick={() => set({ repayments: [...form.repayments, { date: todayStr(), amount: status.outstanding ? String(+status.outstanding.toFixed(2)) : '', note: '' }] })}
          >
            Add repayment
          </Button>
        </div>
        {form.repayments.length === 0 ? (
          <p className="text-xs text-stone-400">No repayments yet. Add one each time money comes back, including part payments.</p>
        ) : (
          <div className="space-y-2">
            {form.repayments.map((r, i) => (
              <div key={r.id || i} className="grid grid-cols-[1fr_1fr] sm:grid-cols-[9rem_1fr_1fr_auto] gap-2 items-center">
                <input type="date" className={inputClass} value={r.date} onChange={(e) => setRepayment(i, { date: e.target.value })} aria-label="Date" />
                <input type="number" min="0" step="0.01" className={inputClass} value={r.amount} onChange={(e) => setRepayment(i, { amount: e.target.value })} placeholder="Amount" aria-label="Amount" />
                <input className={inputClass} value={r.note} onChange={(e) => setRepayment(i, { note: e.target.value })} placeholder="Note" aria-label="Note" />
                <IconButton icon={Trash} label="Remove" onClick={() => set({ repayments: form.repayments.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
        )}
      </div>
      {num(form.amount) > 0 && (
        <Calc>
          {status.settled ? (
            <div className="text-emerald-700 font-semibold">Fully repaid — settled.</div>
          ) : (
            <div>
              Still {lent ? 'owed to you' : 'to pay'}: <b className="text-ink">{formatMoney(status.outstanding, form.currency)}</b>
              {status.repaid > 0 && <> ({formatMoney(status.repaid, form.currency)} repaid)</>}
            </div>
          )}
          <div>Outstanding = amount − repayments. It counts as {lent ? 'an asset' : 'a liability'} in net worth.</div>
        </Calc>
      )}
      <Field label="Note">
        <textarea rows={2} className={inputClass} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional, e.g. what it was for" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Income / expense line ---------- */

export function EntryForm({ open, record, defaults, currencies, categoryLists, accounts, onSave, onDelete, onClose }) {
  const empty = { month: thisMonth(), kind: 'expense', category: categoryLists[defaults?.kind || 'expense'][0], amount: '', currency: 'AED', recurring: false, checklist: false, accountId: '', note: '', ...defaults };
  const [form, set, error, setError] = useForm(open, record, empty);
  const categories = categoryLists[form.kind];

  const save = async () => {
    if (!form.month) return setError('Pick a month'), false;
    if (!(num(form.amount) > 0)) return setError('Enter an amount'), false;
    if (!form.category.trim()) return setError('Pick a category'), false;
    return onSave({
      month: form.month, kind: form.kind, category: form.category.trim(), amount: num(form.amount),
      currency: form.currency, recurring: form.recurring, checklist: form.kind === 'expense' && !!form.checklist, accountId: form.accountId || '', note: form.note.trim(),
    });
  };

  return (
    <FormModal
      open={open}
      title={record ? 'Edit Entry' : form.kind === 'income' ? 'Add Income' : 'Add Expense'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Entry"
      onDelete={record && (async () => confirmDelete('this entry') && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Type"
          value={form.kind}
          onChange={(kind) => set({ kind, category: categoryLists[kind][0] })}
          options={[{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }]}
        />
        <Field label="Month">
          <input type="month" className={inputClass} value={form.month} onChange={(e) => set({ month: e.target.value })} />
        </Field>
        <CategorySelect value={form.category} onChange={(category) => set({ category })} categories={categories} />
        <Money label="Amount" value={form.amount} onChange={(amount) => set({ amount })} />
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Field label="Note">
          <input className={inputClass} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" />
        </Field>
        <AccountSelect label={form.kind === 'income' ? 'Paid into' : 'Paid from'} value={form.accountId} onChange={(accountId) => set({ accountId })} accounts={accounts} />
      </div>
      <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.recurring} onChange={(e) => set({ recurring: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Recurring every month</span>
          <span className="block text-xs text-stone-500">Listed under monthly commitments, and can be copied into the next month.</span>
        </span>
      </label>
      {form.kind === 'expense' && (
        <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.checklist} onChange={(e) => set({ checklist: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold text-stone-900">Include in monthly checklist</span>
            <span className="block text-xs text-stone-500">Shown in the Checklist panel, so you can plan and tick it off every month.</span>
          </span>
        </label>
      )}
      <p className="text-xs text-stone-500">
        Money moved into savings isn't an expense: record it as a transfer between accounts (or a contribution on an investment), so it is not counted twice.
      </p>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Fixed monthly ---------- */

export function FixedForm({ open, record, defaults, currencies, categoryLists, accounts, onSave, onDelete, onMoveToBudget, onClose }) {
  const empty = { kind: 'expense', category: categoryLists[defaults?.kind || 'expense'][0], amount: '', currency: 'AED', startMonth: thisMonth(), endMonth: '', note: '', every: 1, spread: true, accountId: '', checklist: false, ...defaults };
  const [form, set, error, setError] = useForm(open, record, empty);
  const every = Number(form.every) || 1;
  const per = every === 1 ? 'per month' : 'per payment';
  const categories = categoryLists[form.kind];
  // "Varies" turns the amount into a range: amount is the low end, amountMax the high end.
  const varies = form.varies ?? (form.amountMax != null && form.amountMax !== '');

  const save = async () => {
    if (!(num(form.amount) > 0)) return setError(varies ? 'Enter the lowest amount' : 'Enter an amount'), false;
    if (varies && !(num(form.amountMax) > num(form.amount))) return setError('The highest amount must be more than the lowest'), false;
    if (!form.category.trim()) return setError('Pick a category'), false;
    if (!form.startMonth) return setError('Pick a start month'), false;
    if (form.endMonth && form.endMonth < form.startMonth) return setError('End month is before the start month'), false;
    return onSave({
      kind: form.kind, category: form.category.trim(), amount: num(form.amount), amountMax: varies ? num(form.amountMax) : null,
      currency: form.currency, every, spread: form.spread !== false, accountId: form.accountId || '', startMonth: form.startMonth, endMonth: form.endMonth || '', note: form.note.trim(),
      checklist: form.kind === 'expense' && !!form.checklist,
    });
  };

  return (
    <FormModal
      open={open}
      title={record ? 'Edit Fixed Item' : form.kind === 'income' ? 'Add Fixed Income' : 'Add Fixed Expense'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Fixed Item"
      onDelete={record && (async () => confirmDelete('this fixed item from every month') && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Type"
          value={form.kind}
          onChange={(kind) => set({ kind, category: categoryLists[kind][0] })}
          options={[{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }]}
        />
        <CategorySelect value={form.category} onChange={(category) => set({ category })} categories={categories} />
        {varies ? (
          <>
            <Money label={`Lowest ${per}`} value={form.amount} onChange={(amount) => set({ amount })} />
            <Money label={`Highest ${per}`} value={form.amountMax ?? ''} onChange={(amountMax) => set({ amountMax })} />
          </>
        ) : (
          <Money label={`Amount ${per}`} value={form.amount} onChange={(amount) => set({ amount })} />
        )}
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Select label="Paid" value={every} onChange={(e) => set({ every: Number(e) })} options={FREQUENCIES} />
        {every > 1 && (
          <Select
            label="Count it"
            value={form.spread === false ? 'paid' : 'spread'}
            onChange={(v) => set({ spread: v === 'spread' })}
            options={[{ key: 'spread', label: 'Spread across every month' }, { key: 'paid', label: 'Only in the month it is paid' }]}
          />
        )}
        {every > 1 && (
          <p className="col-span-2 -mt-2 text-xs text-stone-500">
            {form.spread === false
              ? `The full amount counts in the “From month”, then every ${every} months after it. Set “From month” to the month of the next payment.`
              : num(form.amount) > 0 && `Counted per month: ${formatMoney(fixedAmount({ amount: num(form.amount), amountMax: varies ? num(form.amountMax) : null, every }), form.currency)}.`}
          </p>
        )}
        <label className="col-span-2 flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={varies} onChange={(e) => set({ varies: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold text-stone-900">Amount varies (enter a range)</span>
            <span className="block text-xs text-stone-500">For bills like utilities. Totals use the middle of the range.</span>
          </span>
        </label>
        <Field label="From month">
          <input type="month" className={inputClass} value={form.startMonth} onChange={(e) => set({ startMonth: e.target.value })} />
        </Field>
        <Field label="Until month">
          <input type="month" className={inputClass} value={form.endMonth} onChange={(e) => set({ endMonth: e.target.value })} />
        </Field>
        <Field label="Note">
          <input className={inputClass} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" />
        </Field>
        <AccountSelect label={form.kind === 'income' ? 'Paid into' : 'Paid from'} value={form.accountId} onChange={(accountId) => set({ accountId })} accounts={accounts} />
      </div>
      {form.kind === 'expense' && (
        <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.checklist} onChange={(e) => set({ checklist: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold text-stone-900">Include in monthly checklist</span>
            <span className="block text-xs text-stone-500">Shown in the Checklist panel in the months it is due, so you can tick it off once paid.</span>
          </span>
        </label>
      )}
      <p className="text-xs text-stone-500">Counted automatically in every month from the start month; quarterly or yearly payments are spread evenly across the months. Leave “Until month” empty to keep it going.</p>
      {record && record.kind === 'expense' && onMoveToBudget && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-stone-200 bg-stone-50">
          <span className="text-xs text-stone-600">Not a fixed amount? Turn it into a monthly {record.category} budget instead.</span>
          <Button variant="soft" onClick={async () => (await onMoveToBudget()) && onClose()}>Move to budget</Button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Transfer between accounts ---------- */

export function TransferForm({ open, record, defaults, currencies, accounts, onSave, onDelete, onClose }) {
  const empty = {
    fromId: accounts[0]?.id || '', toId: accounts[1]?.id || '', amount: '', currency: accounts[0]?.currency || 'AED',
    monthly: false, startMonth: thisMonth(), endMonth: '', note: '', ...defaults,
  };
  const [form, set, error, setError] = useForm(open, record, empty);

  const save = async () => {
    if (!form.fromId || !form.toId) return setError('Pick both accounts'), false;
    if (form.fromId === form.toId) return setError('Pick two different accounts'), false;
    if (!(num(form.amount) > 0)) return setError('Enter an amount'), false;
    if (!form.startMonth) return setError('Pick a month'), false;
    if (form.monthly && form.endMonth && form.endMonth < form.startMonth) return setError('End month is before the start month'), false;
    return onSave({
      fromId: form.fromId, toId: form.toId, amount: num(form.amount), currency: form.currency, monthly: !!form.monthly,
      startMonth: form.startMonth, endMonth: form.monthly ? form.endMonth || '' : '', note: form.note.trim(),
    });
  };

  return (
    <FormModal
      open={open}
      title={record ? 'Edit Transfer' : 'Add Transfer'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Transfer"
      onDelete={record && (async () => confirmDelete(record.monthly ? 'this transfer from every month' : 'this transfer') && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-2 gap-4">
        <AccountSelect
          label="From"
          none={null}
          value={form.fromId}
          onChange={(fromId) => set({ fromId, currency: accounts.find((a) => a.id === fromId)?.currency || form.currency })}
          accounts={accounts}
        />
        <AccountSelect label="To" none={null} value={form.toId} onChange={(toId) => set({ toId })} accounts={accounts} />
        <Money label="Amount" value={form.amount} onChange={(amount) => set({ amount })} />
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Field label={form.monthly ? 'From month' : 'Month'}>
          <input type="month" className={inputClass} value={form.startMonth} onChange={(e) => set({ startMonth: e.target.value })} />
        </Field>
        {form.monthly ? (
          <Field label="Until month">
            <input type="month" className={inputClass} value={form.endMonth} onChange={(e) => set({ endMonth: e.target.value })} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="Note">
          <input className={inputClass} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Rent set-aside" />
        </Field>
      </div>
      <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.monthly} onChange={(e) => set({ monthly: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Every month</span>
          <span className="block text-xs text-stone-500">Repeats each month, like moving rent to savings after salary.</span>
        </span>
      </label>
      <p className="text-xs text-stone-500">A transfer isn't income or an expense: it only moves money between the two balances.</p>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Budget ---------- */

export function BudgetForm({ open, record, currencies, categoryLists, defaultCurrency, usedCategories, onSave, onDelete, onClose }) {
  const empty = { category: '', amount: '', currency: defaultCurrency };
  const [form, set, error, setError] = useForm(open, record, empty);
  const save = async () => {
    const category = form.category.trim();
    if (!category) return setError('Pick a category'), false;
    if (!record && usedCategories.includes(category)) return setError('That category already has a budget'), false;
    if (!(num(form.amount) > 0)) return setError('Enter a monthly amount'), false;
    return onSave({ category, amount: num(form.amount), currency: form.currency });
  };
  return (
    <FormModal
      open={open}
      title={record ? 'Edit Budget' : 'Add Budget'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Budget"
      onDelete={record && (async () => confirmDelete(`the ${record.category} budget`) && (await onDelete()) && onClose())}
    >
      <CategorySelect autoFocus label="Expense category" value={form.category} onChange={(category) => set({ category })} categories={categoryLists.expense} />
      <div className="grid grid-cols-2 gap-4">
        <Money label="Monthly budget" value={form.amount} onChange={(amount) => set({ amount })} />
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
      </div>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Goal ---------- */

export function GoalForm({ open, record, currencies, defaultCurrency, onSave, onDelete, onClose }) {
  const empty = { name: '', type: 'emergency_fund', currency: defaultCurrency, targetAmount: '', currentAmount: '', monthlyContribution: '', targetDate: '' };
  const [form, set, error, setError] = useForm(open, record, empty);
  const save = async () => {
    const name = form.name.trim();
    if (!name) return setError('Give the goal a name'), false;
    if (!(num(form.targetAmount) > 0)) return setError('Enter a target amount'), false;
    return onSave({
      name, type: form.type, currency: form.currency, targetAmount: num(form.targetAmount),
      currentAmount: num(form.currentAmount), monthlyContribution: num(form.monthlyContribution), targetDate: form.targetDate || null,
    });
  };
  return (
    <FormModal
      open={open}
      title={record ? 'Edit Goal' : 'Add Goal'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Goal"
      onDelete={record && (async () => confirmDelete(`"${record.name}"`) && (await onDelete()) && onClose())}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input autoFocus className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. 6-month emergency fund" />
        </Field>
        <Select label="Type" value={form.type} onChange={(type) => set({ type })} options={GOAL_TYPES} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Money label="Target amount" value={form.targetAmount} onChange={(targetAmount) => set({ targetAmount })} />
        {form.type !== 'net_worth' && <Money label="Saved so far" value={form.currentAmount} onChange={(currentAmount) => set({ currentAmount })} />}
        <Money label="Monthly contribution" value={form.monthlyContribution} onChange={(monthlyContribution) => set({ monthlyContribution })} />
        <Field label="Target date">
          <input type="date" className={inputClass} value={form.targetDate || ''} onChange={(e) => set({ targetDate: e.target.value })} />
        </Field>
      </div>
      {form.type === 'net_worth' && <p className="text-xs text-stone-500">Progress follows your actual net worth, so there's nothing to update by hand.</p>}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}
