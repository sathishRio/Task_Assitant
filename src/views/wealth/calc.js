// Wealth calculations. Pure functions over the records from /api/wealth, so every number on
// the page can be traced to one formula here. Amounts are converted to the reporting currency
// before they are added up; nothing is counted in two places:
// - net worth = assets − liabilities, each record counted once;
// - savings = income − expenses; money moved into an investment is an asset flow, not an expense;
// - loan EMIs show as a commitment from the liability itself, not again from expense lines;
// - personal debts (lent / borrowed) count once, at what is still outstanding after repayments.
import { todayStr } from '../../dates';

/* ---------- Labels ---------- */

export const ASSET_TYPES = [
  { key: 'bank', label: 'Bank balance' },
  { key: 'fixed_deposit', label: 'Fixed deposit' },
  { key: 'stock', label: 'Stocks' },
  { key: 'mutual_fund', label: 'Mutual funds' },
  { key: 'gold', label: 'Gold' },
  { key: 'real_estate', label: 'Real estate' },
  { key: 'other', label: 'Other investment' },
];
export const LIABILITY_TYPES = [
  { key: 'personal_loan', label: 'Personal loan' },
  { key: 'car_loan', label: 'Car loan' },
  { key: 'home_loan', label: 'Home loan' },
  { key: 'credit_card', label: 'Credit card' },
  { key: 'installment', label: 'Installment plan' },
  { key: 'other', label: 'Other' },
];
export const GOAL_TYPES = [
  { key: 'emergency_fund', label: 'Emergency fund' },
  { key: 'property', label: 'Property purchase' },
  { key: 'education', label: 'Education' },
  { key: 'retirement', label: 'Retirement' },
  { key: 'debt_repayment', label: 'Debt repayment' },
  { key: 'net_worth', label: 'Target net worth' },
  { key: 'other', label: 'Other' },
];
export const COMPOUNDING = [
  { key: 'monthly', label: 'Monthly', perYear: 12 },
  { key: 'quarterly', label: 'Quarterly', perYear: 4 },
  { key: 'yearly', label: 'Yearly', perYear: 1 },
  { key: 'simple', label: 'Simple interest', perYear: 0 },
];
export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Business', 'Rental', 'Interest & dividends', 'Other income'];
// "Loan EMI" lines are cash flow only; the commitment total takes EMIs from the liabilities instead.
export const LOAN_EMI = 'Loan EMI';
export const EXPENSE_CATEGORIES = [
  'Housing', 'Utilities', 'Groceries', 'Dining', 'Transport', 'Insurance', 'Health', 'Education',
  'Shopping', 'Travel', 'Entertainment', 'Family support', LOAN_EMI, 'Other',
];

export const labelOf = (list, key) => list.find((x) => x.key === key)?.label || key;

/* ---------- Dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
export const monthOf = (dateStr) => dateStr.slice(0, 7);
export const thisMonth = () => monthOf(todayStr());
export const addMonths = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
// Same day-of-month n months later (clamped to the month's last day).
export const addMonthsToDate = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const out = new Date(y, m - 1 + n, Math.min(d, last));
  return `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}`;
};
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const yearsBetween = (a, b) => daysBetween(a, b) / 365.25;
const monthsUntil = (dateStr) => yearsBetween(todayStr(), dateStr) * 12;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatMonth = (month, short) => {
  const [y, m] = month.split('-').map(Number);
  return short ? `${MONTH_NAMES[m - 1]} ’${String(y).slice(2)}` : `${MONTH_NAMES[m - 1]} ${y}`;
};
export const formatDay = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
};

/* ---------- Currency ---------- */

// settings.rates holds the AED value of one unit of each currency; AED is always 1.
export const currenciesOf = (settings) => ['AED', ...Object.keys(settings.rates || {}).filter((c) => c !== 'AED').sort()];
const aedPer = (currency, rates) => (currency === 'AED' ? 1 : rates?.[currency]);
export function convert(amount, from, to, rates) {
  if (from === to) return amount || 0;
  const a = aedPer(from, rates);
  const b = aedPer(to, rates);
  return a && b ? ((amount || 0) * a) / b : 0;
}

// "Hide amounts" on the Wealth page: while on, every formatted amount shows as dots.
let masked = false;
export const setMasked = (on) => {
  masked = on;
};

export function formatMoney(amount, currency, { compact, signed } = {}) {
  if (masked) return '••••••';
  const n = Number.isFinite(amount) ? amount : 0;
  const text = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
  return signed && n > 0 ? `+${text}` : text;
}
export const formatPct = (x, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—');

/* ---------- Assets ---------- */

const perYearOf = (key) => COMPOUNDING.find((c) => c.key === key)?.perYear ?? 4;

// Fixed deposit value after `years`: compound P(1 + r/n)^(n·t), or simple P(1 + r·t).
function grow(principal, ratePct, compounding, years) {
  const r = ratePct / 100;
  const n = perYearOf(compounding);
  const t = Math.max(0, years);
  return n === 0 ? principal * (1 + r * t) : principal * (1 + r / n) ** (n * t);
}

export const isFd = (a) => a.type === 'fixed_deposit';

// A fixed deposit's value accrues from its principal; it stops growing at maturity.
export function fdValueOn(asset, dateStr) {
  if (!asset.startDate) return asset.principal;
  const end = asset.maturityDate && asset.maturityDate < dateStr ? asset.maturityDate : dateStr;
  return grow(asset.principal, asset.interestRate, asset.compounding, yearsBetween(asset.startDate, end));
}
export function fdMaturity(asset) {
  if (!asset.startDate || !asset.maturityDate) return null;
  const value = fdValueOn(asset, asset.maturityDate);
  return { value, interest: value - asset.principal };
}

// Value today, in the asset's own currency.
export const assetValue = (asset) => (isFd(asset) ? fdValueOn(asset, todayStr()) : asset.currentValue);

// Money put in: principal + contributions − withdrawals. Return = value − money put in.
export function assetPerformance(asset) {
  const flows = asset.flows || [];
  const contributions = flows.filter((f) => f.kind === 'contribution').reduce((s, f) => s + f.amount, 0);
  const withdrawals = flows.filter((f) => f.kind === 'withdrawal').reduce((s, f) => s + f.amount, 0);
  const invested = asset.principal + contributions - withdrawals;
  const value = assetValue(asset);
  const gain = value - invested;
  return { contributions, withdrawals, invested, value, gain, gainPct: invested > 0 ? gain / invested : NaN };
}

// Overview buckets: bank = cash; real estate = property; everything else = investments.
export const bucketOf = (type) => (type === 'bank' ? 'cash' : type === 'real_estate' ? 'property' : 'investments');

/* ---------- Liabilities ---------- */

// Months to clear balance B at monthly rate i paying E: n = −ln(1 − iB/E) / ln(1 + i).
// Infinity when the payment does not cover the interest.
export function payoffMonths(balance, ratePct, emi) {
  if (balance <= 0) return 0;
  if (!emi || emi <= 0) return Infinity;
  const i = ratePct / 100 / 12;
  if (i === 0) return balance / emi;
  if (emi <= balance * i) return Infinity;
  return -Math.log(1 - (i * balance) / emi) / Math.log(1 + i);
}

export function loanPlan(liability) {
  const months = payoffMonths(liability.outstanding, liability.interestRate, liability.emi);
  if (!Number.isFinite(months)) return { months, payoffDate: null, interest: null };
  const first = liability.nextPaymentDate || todayStr();
  const payments = Math.ceil(months - 0.01); // tolerate EMIs rounded to the cent
  return {
    months,
    payments,
    payoffDate: payments > 0 ? addMonthsToDate(first, payments - 1) : null,
    // Approximate: the last payment is partial, which the fractional month count accounts for.
    interest: liability.emi * months - liability.outstanding,
  };
}

// Prepaying `extra` now vs investing it, compared over the loan's current remaining term.
// - Prepay: the loan closes earlier; from then on the freed-up EMI is invested monthly.
// - Invest: the lump sum compounds for the whole term while the loan runs as scheduled.
// Both end with the loan paid off, so the wealth each leaves behind is directly comparable.
export function prepayVsInvest(liability, extra, investReturnPct) {
  const { outstanding: B, interestRate, emi: E } = liability;
  const n0 = payoffMonths(B, interestRate, E);
  if (!Number.isFinite(n0) || extra <= 0) return null;
  const x = Math.min(extra, B);
  const n1 = payoffMonths(B - x, interestRate, E);
  const m = investReturnPct / 100 / 12;
  const freedMonths = n0 - n1;
  const prepayWealth = m === 0 ? E * freedMonths : (E * ((1 + m) ** freedMonths - 1)) / m;
  const investWealth = x * (1 + m) ** n0;
  return {
    amount: x,
    monthsSaved: freedMonths,
    interestSaved: E * n0 - B - (E * n1 - (B - x)),
    prepayWealth,
    investWealth,
    horizonMonths: n0,
    better: prepayWealth >= investWealth ? 'prepay' : 'invest',
  };
}

/* ---------- Personal debts (lent / borrowed) ---------- */

export function debtStatus(debt) {
  const repaid = (debt.repayments || []).reduce((s, x) => s + x.amount, 0);
  const outstanding = Math.max(0, debt.amount - repaid);
  const settled = outstanding === 0;
  const daysLeft = debt.dueDate ? daysBetween(todayStr(), debt.dueDate) : null;
  return { repaid, outstanding, settled, overdue: !settled && daysLeft != null && daysLeft < 0, daysLeft };
}

// Outstanding totals in the reporting currency: lent = owed to you, borrowed = owed by you.
export function debtTotals(debts, base, rates) {
  const out = { lent: 0, borrowed: 0 };
  for (const d of debts || []) out[d.direction] += convert(debtStatus(d).outstanding, d.currency, base, rates);
  return out;
}

/* ---------- Cash flow ---------- */

export function monthTotals(entries, month, base, rates) {
  let income = 0;
  let expenses = 0;
  for (const e of entries) {
    if (e.month !== month) continue;
    const v = convert(e.amount, e.currency, base, rates);
    if (e.kind === 'income') income += v;
    else expenses += v;
  }
  const savings = income - expenses;
  return { month, income, expenses, savings, rate: income > 0 ? savings / income : NaN, hasData: income > 0 || expenses > 0 };
}

// Average over the latest `count` months that have any entries, up to and including this month.
export function averageMonth(entries, base, rates, count = 3) {
  const now = thisMonth();
  const months = [...new Set(entries.map((e) => e.month))].filter((m) => m <= now).sort().reverse().slice(0, count);
  if (!months.length) return { income: 0, expenses: 0, savings: 0, months: 0 };
  const totals = months.map((m) => monthTotals(entries, m, base, rates));
  const avg = (k) => totals.reduce((s, t) => s + t[k], 0) / totals.length;
  return { income: avg('income'), expenses: avg('expenses'), savings: avg('savings'), months: months.length };
}

export function expensesByCategory(entries, month, base, rates) {
  const map = new Map();
  for (const e of entries) {
    if (e.month !== month || e.kind !== 'expense') continue;
    map.set(e.category, (map.get(e.category) || 0) + convert(e.amount, e.currency, base, rates));
  }
  return [...map].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export function budgetVsActual(entries, budgets, month, base, rates) {
  const actual = new Map(expensesByCategory(entries, month, base, rates).map((x) => [x.category, x.amount]));
  return budgets
    .map((b) => {
      const budget = convert(b.amount, b.currency, base, rates);
      const spent = actual.get(b.category) || 0;
      return { id: b.id, category: b.category, budget, spent, left: budget - spent, over: spent > budget };
    })
    .sort((a, b) => b.spent / (b.budget || 1) - a.spent / (a.budget || 1));
}

// Recurring expense lines of the month plus every loan EMI. Expense lines in the Loan EMI
// category are left out here, since the liability already supplies that payment.
export function commitments(entries, liabilities, month, base, rates) {
  const recurring = entries
    .filter((e) => e.month === month && e.kind === 'expense' && e.recurring && e.category !== LOAN_EMI)
    .map((e) => ({ id: e.id, name: e.note || e.category, source: e.category, amount: convert(e.amount, e.currency, base, rates) }));
  const emis = liabilities
    .filter((l) => l.emi > 0 && l.outstanding > 0)
    .map((l) => ({ id: l.id, name: l.name, source: 'EMI', amount: convert(l.emi, l.currency, base, rates) }));
  const items = [...emis, ...recurring].sort((a, b) => b.amount - a.amount);
  return { items, total: items.reduce((s, x) => s + x.amount, 0) };
}

/* ---------- Totals ---------- */

export function totals(data) {
  const { assets, liabilities, settings } = data;
  const base = settings.baseCurrency;
  const rates = settings.rates;
  const byBucket = { cash: 0, investments: 0, property: 0 };
  const byType = {};
  for (const a of assets) {
    const v = convert(assetValue(a), a.currency, base, rates);
    byBucket[bucketOf(a.type)] += v;
    byType[a.type] = (byType[a.type] || 0) + v;
  }
  const { lent, borrowed } = debtTotals(data.debts, base, rates);
  const totalAssets = byBucket.cash + byBucket.investments + byBucket.property + lent;
  const loans = liabilities.reduce((s, l) => s + convert(l.outstanding, l.currency, base, rates), 0);
  const totalLiabilities = loans + borrowed;
  const monthlyEmi = liabilities.filter((l) => l.outstanding > 0).reduce((s, l) => s + convert(l.emi, l.currency, base, rates), 0);
  return {
    base,
    ...byBucket,
    byType,
    lent, // money others owe you (an asset)
    borrowed, // money you owe people (a liability)
    loans, // bank loans, cards and installment plans
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    monthlyEmi,
  };
}

// Snapshots in reporting currency, sorted by month; the current month is always the live value.
export function netWorthSeries(data, t, range) {
  const { snapshots, settings } = data;
  const base = settings.baseCurrency;
  const now = thisMonth();
  const points = snapshots
    .filter((s) => s.month < now)
    .map((s) => {
      const assets = convert(s.assets, s.currency, base, settings.rates);
      const liabilities = convert(s.liabilities, s.currency, base, settings.rates);
      return { month: s.month, assets, liabilities, netWorth: assets - liabilities };
    });
  points.push({ month: now, assets: t.totalAssets, liabilities: t.totalLiabilities, netWorth: t.netWorth });
  if (range === 'yearly') {
    // The last recorded month of each year.
    const byYear = new Map();
    points.forEach((p) => byYear.set(p.month.slice(0, 4), p));
    return [...byYear.values()];
  }
  return points.slice(-12);
}

/* ---------- Goals ---------- */

export function goalProgress(goal, netWorthInGoalCurrency) {
  const current = goal.type === 'net_worth' ? Math.max(0, netWorthInGoalCurrency) : goal.currentAmount;
  const remaining = Math.max(0, goal.targetAmount - current);
  const done = remaining === 0;
  const percent = goal.targetAmount > 0 ? Math.min(1, current / goal.targetAmount) : 0;
  // Ignores investment growth on the saved amount: a plain contributions-only estimate.
  const monthsToGo = done ? 0 : goal.monthlyContribution > 0 ? remaining / goal.monthlyContribution : Infinity;
  const eta = Number.isFinite(monthsToGo) ? addMonthsToDate(todayStr(), Math.ceil(monthsToGo)) : null;
  const monthsLeft = goal.targetDate ? monthsUntil(goal.targetDate) : null;
  const required = monthsLeft != null && monthsLeft > 0 ? remaining / monthsLeft : null;
  const behind =
    !done && goal.targetDate != null && (monthsLeft <= 0 || (required != null && goal.monthlyContribution + 1e-9 < required));
  return { current, remaining, percent, done, monthsToGo, eta, required, behind };
}

/* ---------- Forecast ---------- */

// Month-by-month projection. Savings are added to investments each month and grow with them;
// cash and money lent stay flat; property grows with inflation; each loan amortises with its
// own EMI; money borrowed from people stays owed (it has no schedule).
// Monthly savings are taken after EMIs (record EMIs as Loan EMI expenses so they are).
export function forecast(data, t, avg, returnPct) {
  const { settings, liabilities, assets } = data;
  const base = settings.baseCurrency;
  const years = settings.forecastYears;
  const r = returnPct / 100 / 12;
  const infl = settings.inflation / 100;
  const loans = liabilities.map((l) => ({
    balance: convert(l.outstanding, l.currency, base, settings.rates),
    i: l.interestRate / 100 / 12,
    emi: convert(l.emi, l.currency, base, settings.rates),
  }));
  const cash = t.cash + t.lent;
  let investments = t.investments;
  let property = t.property;
  const savings0 = avg.savings;
  const annualExpenses = avg.expenses * 12;
  const realEstate = assets.some((a) => a.type === 'real_estate');

  const points = [{ year: 0, netWorth: t.netWorth, real: t.netWorth }];
  let fiMonth = null;
  const fiCheck = (month, debt) => {
    if (fiMonth != null || annualExpenses <= 0) return;
    const investable = cash + investments + (settings.excludeHomeFromFi ? 0 : property) - debt;
    const needed = (annualExpenses * (1 + infl) ** (month / 12)) / (settings.withdrawalRate / 100);
    if (investable >= needed) fiMonth = month;
  };
  fiCheck(0, t.totalLiabilities);

  for (let month = 1; month <= years * 12; month++) {
    const saving = savings0 * (1 + settings.savingsGrowth / 100) ** Math.floor((month - 1) / 12);
    investments = investments * (1 + r) + saving;
    property *= (1 + infl) ** (1 / 12);
    let debt = t.borrowed;
    for (const loan of loans) {
      if (loan.balance > 0 && loan.emi > 0) loan.balance = Math.max(0, loan.balance * (1 + loan.i) - loan.emi);
      debt += loan.balance;
    }
    fiCheck(month, debt);
    if (month % 12 === 0) {
      const netWorth = cash + investments + property - debt;
      points.push({ year: month / 12, netWorth, real: netWorth / (1 + infl) ** (month / 12) });
    }
  }
  return { points, fiMonth, annualExpenses, hasProperty: realEstate };
}

/* ---------- Insights ---------- */

// Each insight: { tone: good|warning|critical|info, title, detail, how }.
export function insights(data, t, base, rates) {
  const out = [];
  const now = thisMonth();
  const today = todayStr();
  const fmt = (x) => formatMoney(x, base);

  const prev = [...data.snapshots].filter((s) => s.month < now).sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  if (prev) {
    const prevNw = convert(prev.assets - prev.liabilities, prev.currency, base, rates);
    const change = t.netWorth - prevNw;
    out.push({
      tone: change >= 0 ? 'good' : 'warning',
      title: `Net worth ${change >= 0 ? 'up' : 'down'} ${fmt(Math.abs(change))} since ${formatMonth(prev.month)}`,
      detail: prevNw !== 0 ? `${formatPct(change / Math.abs(prevNw))} change` : '',
      how: `Today's net worth (${fmt(t.netWorth)}) minus the ${formatMonth(prev.month)} snapshot (${fmt(prevNw)}).`,
    });
  }

  const cur = monthTotals(data.entries, now, base, rates);
  const last = monthTotals(data.entries, addMonths(now, -1), base, rates);
  if (cur.hasData && last.hasData && Number.isFinite(cur.rate) && Number.isFinite(last.rate)) {
    const diff = cur.rate - last.rate;
    out.push({
      tone: diff >= 0 ? 'good' : 'warning',
      title: `Savings rate ${formatPct(cur.rate)} this month (${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)} pts)`,
      detail: `Last month: ${formatPct(last.rate)}`,
      how: '(Income − expenses) ÷ income, for each month.',
    });
  }

  const avg = averageMonth(data.entries, base, rates);
  if (avg.expenses > 0) {
    const months = t.cash / avg.expenses;
    out.push({
      tone: months >= 6 ? 'good' : months >= 3 ? 'warning' : 'critical',
      title: `Emergency fund covers ${months.toFixed(1)} months of expenses`,
      detail: months >= 6 ? 'At or above the usual 6-month target.' : 'The usual target is 3–6 months.',
      how: `Bank balances (${fmt(t.cash)}) ÷ average monthly expenses over the last ${avg.months} month(s) (${fmt(avg.expenses)}).`,
    });
  }

  for (const a of data.assets) {
    if (!isFd(a) || !a.maturityDate) continue;
    const days = daysBetween(today, a.maturityDate);
    if (days < 0 || days > 60) continue;
    const m = fdMaturity(a);
    out.push({
      tone: 'info',
      title: `${a.name} matures ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      detail: m ? `Maturity value ${formatMoney(m.value, a.currency)} (${formatMoney(m.interest, a.currency)} interest).` : '',
      how: 'Fixed deposits maturing within the next 60 days.',
    });
  }

  for (const l of data.liabilities) {
    if (!l.nextPaymentDate || l.outstanding <= 0) continue;
    const days = daysBetween(today, l.nextPaymentDate);
    if (days > 14) continue;
    out.push({
      tone: days < 0 ? 'critical' : 'info',
      title: days < 0 ? `${l.name} payment was due ${formatDay(l.nextPaymentDate)}` : `${l.name} payment due ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      detail: l.emi ? `EMI ${formatMoney(l.emi, l.currency)}` : '',
      how: 'Loans whose next payment date is within 14 days (or already past). Update the date after paying.',
    });
  }

  for (const d of data.debts || []) {
    const st = debtStatus(d);
    if (st.settled || st.daysLeft == null || st.daysLeft > 14) continue;
    const amount = formatMoney(st.outstanding, d.currency);
    const lent = d.direction === 'lent';
    const when = st.daysLeft < 0 ? `was due ${formatDay(d.dueDate)}` : st.daysLeft === 0 ? 'is due today' : `is due in ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'}`;
    out.push({
      tone: st.overdue ? (lent ? 'warning' : 'critical') : 'info',
      title: lent ? `${d.person} owes you ${amount} — ${when}` : `You owe ${d.person} ${amount} — ${when}`,
      detail: st.repaid > 0 ? `${formatMoney(st.repaid, d.currency)} of ${formatMoney(d.amount, d.currency)} already repaid.` : '',
      how: 'Money lent or borrowed whose due date is within 14 days or already past. Outstanding = amount − repayments.',
    });
  }

  for (const b of budgetVsActual(data.entries, data.budgets, now, base, rates)) {
    if (!b.over) continue;
    out.push({
      tone: 'critical',
      title: `${b.category} is over budget by ${fmt(b.spent - b.budget)}`,
      detail: `Spent ${fmt(b.spent)} of ${fmt(b.budget)} this month.`,
      how: `${formatMonth(now)} expense lines in ${b.category} compared with its monthly budget.`,
    });
  }

  for (const g of data.goals) {
    const nw = convert(t.netWorth, base, g.currency, rates);
    const p = goalProgress(g, nw);
    if (!p.behind) continue;
    out.push({
      tone: 'warning',
      title: `${g.name} is behind schedule`,
      detail:
        p.required != null
          ? `Needs ${formatMoney(p.required, g.currency)}/month to reach the target by ${formatDay(g.targetDate)}; planned ${formatMoney(g.monthlyContribution, g.currency)}.`
          : `Target date ${formatDay(g.targetDate)} has passed with ${formatMoney(p.remaining, g.currency)} to go.`,
      how: 'Remaining amount ÷ months left until the target date, compared with the planned monthly contribution.',
    });
  }

  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
