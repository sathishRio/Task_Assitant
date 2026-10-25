import { useEffect, useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { FormModal } from '../../forms';
import { todayStr } from '../../dates';
import { Button, Field, IconButton, cx, inputClass } from '../../ui';
import {
  ASSET_TYPES, COMPOUNDING, EXPENSE_CATEGORIES, GOAL_TYPES, INCOME_CATEGORIES, LIABILITY_TYPES,
  debtStatus, fdMaturity, formatMoney, isFd, loanPlan, formatDay, thisMonth,
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

const Calc = ({ children }) => (
  <div className="rounded-xl border-[1.5px] border-dashed border-stone-300 bg-stone-50 px-3.5 py-2.5 text-xs text-stone-600 space-y-0.5">{children}</div>
);

/* ---------- Asset ---------- */

export function AssetForm({ open, record, currencies, defaultCurrency, onSave, onDelete, onClose }) {
  const empty = {
    name: '', type: 'bank', currency: defaultCurrency, principal: '', currentValue: '', interestRate: '',
    compounding: 'quarterly', startDate: '', maturityDate: '', flows: [], notes: '',
  };
  const [form, set, error, setError] = useForm(open, record, empty);
  const fd = isFd(form);
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
      name, type: form.type, currency: form.currency, notes: form.notes.trim(),
      principal: num(form.principal),
      currentValue: fd ? 0 : num(form.currentValue),
      interestRate: num(form.interestRate),
      compounding: form.compounding,
      startDate: form.startDate || null,
      maturityDate: form.maturityDate || null,
      flows: form.flows.map(({ date, kind, amount, note }) => ({ date, kind, amount: num(amount), note: note || '' })),
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
        {!fd && <Money label="Current value" value={form.currentValue} onChange={(currentValue) => set({ currentValue })} />}
        {hasRate && <Money label="Interest rate" value={form.interestRate} onChange={(interestRate) => set({ interestRate })} suffix="% / yr" />}
      </div>
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
            <Button variant="ghost" icon={Plus} onClick={() => set({ flows: [...form.flows, { date: todayStr(), kind: 'contribution', amount: '', note: '' }] })}>
              Add
            </Button>
          </div>
          {form.flows.length === 0 ? (
            <p className="text-xs text-stone-400">Money added or taken out after the first investment. Return = current value − (amount put in + contributions − withdrawals).</p>
          ) : (
            <div className="space-y-2">
              {form.flows.map((f, i) => (
                <div key={f.id || i} className="grid grid-cols-[1fr_1fr] sm:grid-cols-[9rem_8rem_1fr_1fr_auto] gap-2 items-center">
                  <input type="date" className={inputClass} value={f.date} onChange={(e) => setFlow(i, { date: e.target.value })} aria-label="Date" />
                  <select className={inputClass} value={f.kind} onChange={(e) => setFlow(i, { kind: e.target.value })} aria-label="Kind">
                    <option value="contribution">Added</option>
                    <option value="withdrawal">Withdrawn</option>
                  </select>
                  <input type="number" min="0" step="0.01" className={inputClass} value={f.amount} onChange={(e) => setFlow(i, { amount: e.target.value })} placeholder="Amount" aria-label="Amount" />
                  <input className={inputClass} value={f.note} onChange={(e) => setFlow(i, { note: e.target.value })} placeholder="Note" aria-label="Note" />
                  <IconButton icon={Trash} label="Remove" onClick={() => set({ flows: form.flows.filter((_, j) => j !== i) })} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Field label="Notes">
        <textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Liability ---------- */

export function LiabilityForm({ open, record, currencies, defaultCurrency, onSave, onDelete, onClose }) {
  const empty = {
    name: '', type: 'personal_loan', currency: defaultCurrency, outstanding: '', interestRate: '', emi: '',
    remainingMonths: '', nextPaymentDate: '', notes: '',
  };
  const [form, set, error, setError] = useForm(open, record, empty);
  const plan = loanPlan({ outstanding: num(form.outstanding), interestRate: num(form.interestRate), emi: num(form.emi), nextPaymentDate: form.nextPaymentDate || null });

  const save = async () => {
    const name = form.name.trim();
    if (!name) return setError('Give the liability a name'), false;
    return onSave({
      name, type: form.type, currency: form.currency, notes: form.notes.trim(),
      outstanding: num(form.outstanding), interestRate: num(form.interestRate), emi: num(form.emi),
      remainingMonths: form.remainingMonths === '' || form.remainingMonths == null ? null : num(form.remainingMonths),
      nextPaymentDate: form.nextPaymentDate || null,
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
        <Money label="Outstanding principal" value={form.outstanding} onChange={(outstanding) => set({ outstanding })} />
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

export function EntryForm({ open, record, defaults, currencies, onSave, onDelete, onClose }) {
  const empty = { month: thisMonth(), kind: 'expense', category: 'Groceries', amount: '', currency: 'AED', recurring: false, note: '', ...defaults };
  const [form, set, error, setError] = useForm(open, record, empty);
  const categories = form.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const save = async () => {
    if (!form.month) return setError('Pick a month'), false;
    if (!(num(form.amount) > 0)) return setError('Enter an amount'), false;
    if (!form.category.trim()) return setError('Pick a category'), false;
    return onSave({
      month: form.month, kind: form.kind, category: form.category.trim(), amount: num(form.amount),
      currency: form.currency, recurring: form.recurring, note: form.note.trim(),
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
          onChange={(kind) => set({ kind, category: (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] })}
          options={[{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }]}
        />
        <Field label="Month">
          <input type="month" className={inputClass} value={form.month} onChange={(e) => set({ month: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className={inputClass} list="wealth-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
          <datalist id="wealth-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Money label="Amount" value={form.amount} onChange={(amount) => set({ amount })} />
        <CurrencySelect value={form.currency} onChange={(currency) => set({ currency })} currencies={currencies} />
        <Field label="Note">
          <input className={inputClass} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
      <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.recurring} onChange={(e) => set({ recurring: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Recurring every month</span>
          <span className="block text-xs text-stone-500">Listed under monthly commitments, and can be copied into the next month.</span>
        </span>
      </label>
      <p className="text-xs text-stone-500">
        Money moved into savings or investments isn't an expense: record it as a contribution on the asset, so it is not counted twice.
      </p>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Budget ---------- */

export function BudgetForm({ open, record, currencies, defaultCurrency, usedCategories, onSave, onDelete, onClose }) {
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
      <Field label="Expense category">
        <input autoFocus className={inputClass} list="wealth-budget-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
        <datalist id="wealth-budget-categories">
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
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
