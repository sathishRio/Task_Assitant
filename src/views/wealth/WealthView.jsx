import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BadgeCheck, CalendarClock, ChartLine, CircleAlert, Coins, Copy, Flag, HandCoins, Handshake, Info, Landmark,
  Eye, EyeOff, LoaderCircle, Pencil, PiggyBank, Plus, Receipt, RefreshCw, Scale, TrendingUp, TriangleAlert,
} from 'lucide-react';
import { useStore } from '../../store';
import { wealthApi } from '../../api';
import { todayStr } from '../../dates';
import { Badge, Button, Card, EmptyState, IconButton, ProgressBar, cx, inputClass, selectClass } from '../../ui';
import { TONES } from '../../theme';
import { Allocation, ColumnChart, LimitBar, LineChart, Legend, SERIES } from './charts';
import { AssetForm, BudgetForm, DebtForm, EntryForm, GoalForm, LiabilityForm } from './WealthForms';
import {
  ASSET_TYPES, GOAL_TYPES, LIABILITY_TYPES, addMonths, assetPerformance, averageMonth, budgetVsActual, commitments, debtStatus,
  convert, currenciesOf, expensesByCategory, fdMaturity, forecast, formatDay, formatMoney, formatMonth, formatPct, goalProgress,
  insights, isFd, labelOf, loanPlan, monthTotals, netWorthSeries, prepayVsInvest, setMasked, thisMonth, totals,
} from './calc';

// Wealth Management (#/wealth). Reachable by URL only: it is not in the header or account menu.
// Its data is private to the signed-in account and loaded only when this page opens.

const TABS = [
  { key: 'overview', label: 'Overview', Icon: ChartLine },
  { key: 'assets', label: 'Assets', Icon: Landmark },
  { key: 'liabilities', label: 'Liabilities', Icon: Receipt },
  { key: 'debts', label: 'Lent & Borrowed', Icon: Handshake },
  { key: 'cashflow', label: 'Income & Expenses', Icon: ArrowRightLeft },
  { key: 'goals', label: 'Goals', Icon: Flag },
  { key: 'forecast', label: 'Forecast', Icon: TrendingUp },
  { key: 'currency', label: 'Currencies', Icon: Coins },
];
const TAB_STORAGE = 'task-assistant/wealth-tab';
const HIDE_STORAGE = 'task-assistant/wealth-hide';
const EMERGENCY_TARGET = 6; // months of expenses

// Same soft panel tints as the Home page: card background, then the count chip.
const TINTS = {
  yellow: ['bg-taxi-soft!', 'bg-ink text-taxi'],
  green: ['bg-[#e3f5ec]!', 'bg-zone-green text-white'],
  red: ['bg-rose-50!', 'bg-rose-600 text-white'],
};

// Asset types keep a fixed colour slot, so a type's colour never changes as others come and go.
const TYPE_COLOR = Object.fromEntries(ASSET_TYPES.map((t, i) => [t.key, SERIES[i]]));
const SCENARIOS = [
  { key: 'conservative', label: 'Conservative', color: SERIES[1] },
  { key: 'moderate', label: 'Moderate', color: SERIES[0] },
  { key: 'optimistic', label: 'Optimistic', color: SERIES[2] },
];
const INSIGHT_TONES = {
  critical: { label: 'Action', chip: 'bg-rose-600 text-white' },
  warning: { label: 'Watch', chip: 'bg-ink text-taxi' },
  info: { label: 'Upcoming', chip: 'bg-zone-blue text-white' },
  good: { label: 'Good', chip: 'bg-zone-green text-white' },
};

// Per-browser conveniences only; the page works the same without storage.
const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

/* ---------- Data hook ---------- */

function useWealth() {
  const { actions } = useStore();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const result = await actions.run(() => wealthApi.load());
    if (result) setData(result);
    else setFailed(true);
  }, [actions]);

  useEffect(() => {
    load();
  }, [load]);

  const create = (collection) => async (payload) => {
    const item = await actions.run(() => wealthApi.create(collection, payload));
    if (item) setData((d) => ({ ...d, [collection]: [...(d[collection] || []), item] }));
    return item;
  };
  const update = (collection, id) => async (payload) => {
    const item = await actions.run(() => wealthApi.update(collection, id, payload));
    if (item) setData((d) => ({ ...d, [collection]: d[collection].map((x) => (x.id === id ? item : x)) }));
    return item;
  };
  const remove = (collection, id) => async () => {
    const ok = await actions.run(() => wealthApi.remove(collection, id).then(() => true));
    if (ok) setData((d) => ({ ...d, [collection]: d[collection].filter((x) => x.id !== id) }));
    return ok;
  };
  const saveSettings = async (patch) => {
    const settings = await actions.run(() => wealthApi.saveSettings(patch));
    if (settings) setData((d) => ({ ...d, settings }));
    return settings;
  };
  const saveSnapshot = useCallback(async (month, payload) => {
    // Quiet background save: no toast if it fails, it is retried on the next change.
    try {
      const snap = await wealthApi.saveSnapshot(month, payload);
      setData((d) => ({ ...d, snapshots: [...d.snapshots.filter((s) => s.month !== month), snap] }));
    } catch {
      // ignore
    }
  }, []);

  return { data, failed, load, create, update, remove, saveSettings, saveSnapshot };
}

/* ---------- Page ---------- */

export default function WealthView() {
  const w = useWealth();
  const [tab, setTabState] = useState(() => {
    const saved = readPref(TAB_STORAGE, 'overview');
    return TABS.some((t) => t.key === saved) ? saved : 'overview';
  });
  const [hide, setHideState] = useState(() => readPref(HIDE_STORAGE, '') === '1');
  const setTab = (key) => {
    setTabState(key);
    writePref(TAB_STORAGE, key);
  };
  const toggleHide = () => {
    setHideState(!hide);
    writePref(HIDE_STORAGE, hide ? '' : '1');
  };

  if (!w.data) {
    return w.failed ? (
      <Card className="max-w-md mx-auto mt-16 p-6 text-center">
        <h1 className="text-xl font-bold">Can't load your wealth data</h1>
        <p className="text-sm text-stone-500 mt-1">Check that the server is running and up to date.</p>
        <Button icon={RefreshCw} onClick={w.load} className="mt-5">Try again</Button>
      </Card>
    ) : (
      <div className="flex justify-center mt-24">
        <LoaderCircle className="w-8 h-8 text-ink animate-spin" />
      </div>
    );
  }
  return <WealthPage w={w} tab={tab} setTab={setTab} hide={hide} toggleHide={toggleHide} />;
}

function WealthPage({ w, tab, setTab, hide, toggleHide }) {
  // "Hide amounts" masks every formatted figure on this page; it is switched off again on leaving.
  setMasked(hide);
  useEffect(() => () => setMasked(false), []);

  const { data } = w;
  const { settings } = data;
  const base = settings.baseCurrency;
  const rates = settings.rates;
  const currencies = currenciesOf(settings);
  const money = (x, opts) => formatMoney(x, base, opts);
  const t = useMemo(() => totals(data), [data]);
  const now = thisMonth();
  const avg = useMemo(() => averageMonth(data.entries, base, rates), [data.entries, base, rates]);
  const notes = insights(data, t, base, rates);
  const attention = notes.filter((n) => n.tone === 'critical' || n.tone === 'warning').length;
  const monthly = netWorthSeries(data, t, 'monthly');
  const prev = monthly.length > 1 ? monthly.at(-2) : null;
  const change = prev ? t.netWorth - prev.netWorth : null;
  const cover = avg.expenses > 0 ? t.cash / avg.expenses : null;

  // Record this month's net worth whenever it changes, so the growth chart builds up over time.
  const { saveSnapshot } = w;
  const stored = data.snapshots.find((s) => s.month === now);
  useEffect(() => {
    const same =
      stored && stored.currency === base && Math.abs(stored.assets - t.totalAssets) < 0.005 && Math.abs(stored.liabilities - t.totalLiabilities) < 0.005;
    if (same || (!stored && t.totalAssets === 0 && t.totalLiabilities === 0)) return;
    const timer = setTimeout(() => saveSnapshot(now, { currency: base, assets: t.totalAssets, liabilities: t.totalLiabilities }), 800);
    return () => clearTimeout(timer);
  }, [stored, base, now, t.totalAssets, t.totalLiabilities, saveSnapshot]);

  const ctx = { w, data, settings, base, rates, currencies, money, t, avg, now, notes, cover };
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs font-semibold uppercase tracking-wider text-stone-500">
            <span>Wealth · {today} · reporting in</span>
            <select
              className="bg-transparent border-b-[1.5px] border-ink text-ink font-semibold uppercase cursor-pointer focus:outline-none"
              value={base}
              onChange={(e) => w.saveSettings({ baseCurrency: e.target.value })}
              aria-label="Reporting currency"
            >
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-ink leading-[1.05] text-balance">
            {t.netWorth < 0 ? 'Your net worth is ' : "You're worth "}
            <span className="hl">{money(t.netWorth)}</span>
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {change != null && (
              <>
                {change >= 0 ? 'Up' : 'Down'} <b className={change >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{money(Math.abs(change))}</b> since{' '}
                {formatMonth(prev.month)} ·{' '}
              </>
            )}
            {attention ? `${attention} thing${attention === 1 ? ' needs' : 's need'} a look` : 'Nothing needs your attention'}
          </p>
        </div>
        <Button variant="soft" icon={hide ? Eye : EyeOff} className="px-4 py-2.5 text-sm" onClick={toggleHide} aria-pressed={hide}>
          {hide ? 'Show amounts' : 'Hide amounts'}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pt-1 pb-2" role="tablist">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] border-[1.5px] font-mono text-[11px] font-semibold uppercase tracking-wider transition',
              tab === key ? 'bg-taxi border-ink text-ink shadow-key' : 'bg-white border-stone-300 text-stone-600 hover:border-ink hover:text-ink',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Total assets"
          zone="bg-zone-blue"
          value={money(t.totalAssets, { compact: true })}
          note={t.lent ? `incl. ${money(t.lent, { compact: true })} lent to people` : `${data.assets.length} record${data.assets.length === 1 ? '' : 's'}`}
          onClick={() => setTab('assets')}
        />
        <Stat
          label="Liabilities"
          zone="bg-zone-orange"
          value={money(t.totalLiabilities, { compact: true })}
          note={t.borrowed ? `incl. ${money(t.borrowed, { compact: true })} owed to people` : `EMIs ${money(t.monthlyEmi, { compact: true })} / month`}
          onClick={() => setTab('liabilities')}
        />
        <Stat label="Investments" zone="bg-zone-green" value={money(t.investments, { compact: true })} note="Stocks, funds, FDs, gold, other" onClick={() => setTab('assets')} />
        <Stat
          label="Cash"
          zone="bg-taxi"
          value={money(t.cash, { compact: true })}
          note={cover != null ? `${cover.toFixed(1)} months of expenses` : 'Bank balances'}
          onClick={() => setTab('assets')}
        />
      </div>

      {tab === 'overview' && <Overview {...ctx} />}
      {tab === 'assets' && <Assets {...ctx} />}
      {tab === 'liabilities' && <Liabilities {...ctx} />}
      {tab === 'debts' && <Debts {...ctx} />}
      {tab === 'cashflow' && <CashFlow {...ctx} />}
      {tab === 'goals' && <Goals {...ctx} />}
      {tab === 'forecast' && <Forecast {...ctx} />}
      {tab === 'currency' && <Currencies {...ctx} />}
    </div>
  );
}

/* ---------- Shared bits ---------- */

// Panel with a title bar, as on the Home page. `block` = ink outline + hard shadow for the panels
// that should stand out, `tint` (a TINTS key) colours the whole panel, `chip` shows a count or total.
function Section({ title, icon: Icon, action, children, className, subtitle, block, tint, chip, flush }) {
  const tone = TINTS[tint];
  return (
    <Card block={block} className={cx('overflow-hidden', tone?.[0], className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b-[1.5px] border-stone-200">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            {Icon && <Icon className="w-5 h-5 shrink-0" />}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chip !== undefined && (
            <span className={cx('font-mono text-[11px] font-semibold rounded-md px-2 py-0.5 tabular-nums', tone ? tone[1] : 'bg-stone-100 text-stone-700')}>{chip}</span>
          )}
          {action}
        </div>
      </div>
      <div className={flush ? undefined : 'p-4 sm:p-5'}>{children}</div>
    </Card>
  );
}

// Key figure tile, as on the Home page: zone swatch, mono label, big number.
function Stat({ label, value, note, zone, negative, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'min-w-0 text-left rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 py-3',
        onClick && 'transition hover:border-ink hover:shadow-block hover:-translate-x-0.5 hover:-translate-y-0.5',
      )}
    >
      <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        <span className={cx('w-2.5 h-2.5 rounded-[2px] shrink-0', zone)} />
        <span className="truncate">{label}</span>
      </span>
      <span className={cx('block mt-1.5 font-display text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums leading-none truncate', negative ? 'text-rose-700' : 'text-ink')}>
        {value}
      </span>
      {note && <span className="block mt-1.5 text-xs text-stone-500 truncate">{note}</span>}
    </Tag>
  );
}

// Original amount, with the converted figure underneath when the currencies differ.
function Amount({ value, currency, base, rates, className }) {
  return (
    <div className={cx('text-right tabular-nums', className)}>
      <div className="font-semibold text-ink">{formatMoney(value, currency)}</div>
      {currency !== base && <div className="text-[11px] text-stone-500">≈ {formatMoney(convert(value, currency, base, rates), base)}</div>}
    </div>
  );
}

const Segmented = ({ value, onChange, options }) => (
  <div className="inline-flex rounded-lg border-[1.5px] border-ink overflow-hidden">
    {options.map((o) => (
      <button
        key={o.key}
        type="button"
        onClick={() => onChange(o.key)}
        aria-pressed={value === o.key}
        className={cx(
          'px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition',
          value === o.key ? 'bg-ink text-taxi' : 'bg-white text-stone-600 hover:text-ink',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// Editing state for one collection: null | 'new' | record.
function useEditor() {
  const [editing, setEditing] = useState(null);
  return { editing, open: !!editing, record: editing && editing !== 'new' ? editing : null, start: setEditing, close: () => setEditing(null) };
}

/* ---------- Overview ---------- */

function Overview({ data, base, money, t, avg, notes, cover }) {
  const [range, setRange] = useState('monthly');
  const [hover, setHover] = useState(null);
  const series = netWorthSeries(data, t, range).map((p) => ({ ...p, label: range === 'yearly' ? p.month.slice(0, 4) : formatMonth(p.month, true) }));
  const shown = series[hover ?? series.length - 1];
  const change = series.length > 1 ? shown.netWorth - series[0].netWorth : null;
  const slices = [
    ...ASSET_TYPES.map((type) => ({ key: type.key, label: type.label, value: t.byType[type.key] || 0, color: TYPE_COLOR[type.key] })),
    { key: 'lent', label: 'Money lent', value: t.lent, color: SERIES[7] },
  ].filter((s) => s.value > 0);
  const compact = (x) => money(x, { compact: true });

  return (
    <div className="grid lg:grid-cols-5 gap-5 items-start">
      <div className="lg:col-span-3 space-y-5 min-w-0">
        <Section
          block
          title="Net worth growth"
          icon={ChartLine}
          action={<Segmented value={range} onChange={(v) => { setRange(v); setHover(null); }} options={[{ key: 'monthly', label: 'Monthly' }, { key: 'yearly', label: 'Yearly' }]} />}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">{shown.label}</span>
            <span className="font-display text-2xl font-extrabold tracking-tight text-ink tabular-nums">{money(shown.netWorth)}</span>
            {change != null && (
              <span className={cx('font-mono text-xs font-semibold rounded-md px-2 py-0.5 tabular-nums', change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                {money(change, { signed: true })} since {series[0].label}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {series.length < 2 ? 'Recorded automatically each month you open this page; the line grows from here.' : 'Point at the chart to see any month; the last point is today.'}
          </p>
          <Legend
            className="mt-3 mb-1"
            items={[
              { label: 'Net worth', color: '#1c2024', line: true },
              { label: 'Assets', color: SERIES[2], line: true },
              { label: 'Liabilities', color: SERIES[1], line: true },
            ]}
          />
          <LineChart
            ariaLabel="Net worth over time"
            points={series}
            series={[
              { key: 'netWorth', label: 'Net worth', color: '#1c2024', area: true },
              { key: 'assets', label: 'Assets', color: SERIES[2] },
              { key: 'liabilities', label: 'Liabilities', color: SERIES[1] },
            ]}
            format={(x) => money(x)}
            formatTick={compact}
            onHover={setHover}
          />
        </Section>

        <Section block tint="yellow" title="Worth a look" icon={Info} chip={notes.length} flush>
          {notes.length ? (
            <div className="divide-y-[1.5px] divide-ink/10">
              {notes.map((x, i) => {
                const tone = INSIGHT_TONES[x.tone];
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <span className={cx('shrink-0 w-[4.75rem] mt-0.5 text-center rounded-[5px] py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', tone.chip)}>
                      {tone.label}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{x.title}</div>
                      {x.detail && <p className="text-xs text-stone-600 mt-0.5">{x.detail}</p>}
                      <p className="text-[11px] text-stone-500 mt-1">How: {x.how}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState text="Notes appear once you add assets, loans, monthly income and expenses, budgets or goals." />
            </div>
          )}
        </Section>
      </div>

      <div className="lg:col-span-2 space-y-5 min-w-0">
        <EmergencyFund cash={t.cash} expenses={avg.expenses} cover={cover} money={money} />
        <Section title="Where it sits" icon={Scale} subtitle={`Assets by type, in ${base}`} flush>
          {slices.length ? (
            <Allocation slices={slices} format={compact} totalLabel="Total assets" />
          ) : (
            <div className="p-4">
              <EmptyState text="Add assets to see how your wealth is spread." />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// Cash in the bank against months of average spending, drawn as the Home page's road.
function EmergencyFund({ cash, expenses, cover, money }) {
  const pct = cover == null ? 0 : Math.min(100, (cover / EMERGENCY_TARGET) * 100);
  return (
    <div className="rounded-2xl border-[1.5px] border-ink bg-ink p-5 shadow-block-taxi">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-on-ink">Emergency fund · target {EMERGENCY_TARGET} months</div>
      {cover == null ? (
        <>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-[-0.03em] text-white leading-tight">Add your monthly expenses</div>
          <p className="text-xs text-on-ink mt-2">It is measured against your average monthly spending from Income & Expenses.</p>
        </>
      ) : (
        <>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-[-0.03em] text-white leading-tight">
            {cover.toFixed(1)} months of expenses covered
          </div>
          <div className="flex flex-wrap justify-between gap-2 mt-4 mb-2.5 font-mono text-xs text-on-ink tabular-nums">
            <span>{money(cash)} in the bank</span>
            <span>
              <b className="text-taxi">{Math.round(pct)}%</b> of the road
            </span>
          </div>
          <ProgressBar gradient percent={pct} />
          <p className="text-xs text-on-ink mt-2.5">
            {cover >= EMERGENCY_TARGET ? 'Target reached.' : `${money(expenses * EMERGENCY_TARGET - cash)} more reaches ${EMERGENCY_TARGET} months.`}
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- Assets ---------- */

function Assets({ w, data, base, rates, currencies, money, t }) {
  const ed = useEditor();
  const byBucket = [
    { key: 'cash', label: 'Cash', value: t.cash },
    { key: 'investments', label: 'Investments', value: t.investments },
    { key: 'property', label: 'Property', value: t.property },
  ];
  const sorted = [...data.assets].sort(
    (a, b) => ASSET_TYPES.findIndex((x) => x.key === a.type) - ASSET_TYPES.findIndex((x) => x.key === b.type) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <Section
        title="Assets & investments"
        icon={Landmark}
        subtitle="Bank balances, fixed deposits, stocks, funds, gold, property and more."
        action={<Button icon={Plus} onClick={() => ed.start('new')}>Add asset</Button>}
      >
        <div className="grid grid-cols-3 gap-3 mb-4">
          {byBucket.map((b) => (
            <div key={b.key} className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
              <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">{b.label}</div>
              <div className="text-sm sm:text-base font-bold text-ink tabular-nums">{money(b.value, { compact: true })}</div>
            </div>
          ))}
        </div>
        {sorted.length === 0 ? (
          <EmptyState icon={Landmark} title="No assets yet" text="Add a bank balance or investment to start tracking your net worth." />
        ) : (
          <div className="divide-y divide-stone-200 -mx-4 sm:-mx-5">
            {sorted.map((a) => {
              const perf = assetPerformance(a);
              const fd = isFd(a);
              const maturity = fd && fdMaturity(a);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => ed.start(a)}
                  className="w-full text-left px-4 sm:px-5 py-3 hover:bg-stone-50 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: TYPE_COLOR[a.type] }} />
                      <span className="text-sm font-semibold text-ink truncate">{a.name}</span>
                      <Badge>{labelOf(ASSET_TYPES, a.type)}</Badge>
                      {a.interestRate > 0 && <Badge tone={TONES.blue}>{a.interestRate}% p.a.</Badge>}
                    </div>
                    <div className="text-xs text-stone-500 mt-1 space-x-3">
                      {fd ? (
                        <>
                          <span>Principal {formatMoney(a.principal, a.currency)}</span>
                          {maturity && (
                            <span>
                              Matures {formatDay(a.maturityDate)} at {formatMoney(maturity.value, a.currency)} (+{formatMoney(maturity.interest, a.currency)})
                            </span>
                          )}
                        </>
                      ) : (
                        a.type !== 'bank' &&
                        perf.invested > 0 && (
                          <>
                            <span>Put in {formatMoney(perf.invested, a.currency)}</span>
                            {(perf.contributions > 0 || perf.withdrawals > 0) && (
                              <span>
                                (+{formatMoney(perf.contributions, a.currency)} / −{formatMoney(perf.withdrawals, a.currency)})
                              </span>
                            )}
                            <span className={perf.gain >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              Return {formatMoney(perf.gain, a.currency, { signed: true })} ({formatPct(perf.gainPct)})
                            </span>
                          </>
                        )
                      )}
                    </div>
                  </div>
                  <Amount value={perf.value} currency={a.currency} base={base} rates={rates} />
                </button>
              );
            })}
          </div>
        )}
      </Section>
      <AssetForm
        open={ed.open}
        record={ed.record}
        currencies={currencies}
        defaultCurrency={base}
        onSave={ed.record ? w.update('assets', ed.record.id) : w.create('assets')}
        onDelete={ed.record && w.remove('assets', ed.record.id)}
        onClose={ed.close}
      />
    </>
  );
}

/* ---------- Liabilities ---------- */

function Liabilities({ w, data, settings, base, rates, currencies, money, t }) {
  const ed = useEditor();
  const loans = data.liabilities;

  return (
    <div className="space-y-4">
      <Section
        title="Liabilities & loans"
        icon={Receipt}
        subtitle="Loans, credit cards and installment plans."
        action={<Button icon={Plus} onClick={() => ed.start('new')}>Add liability</Button>}
      >
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">Loans outstanding</div>
            <div className="text-base font-bold text-ink tabular-nums">{money(t.loans)}</div>
          </div>
          <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">Monthly EMIs</div>
            <div className="text-base font-bold text-ink tabular-nums">{money(t.monthlyEmi)}</div>
          </div>
        </div>
        {loans.length === 0 ? (
          <EmptyState icon={Receipt} title="No liabilities" text="Debt-free, or add a loan or card balance to track it." />
        ) : (
          <div className="divide-y divide-stone-200 -mx-4 sm:-mx-5">
            {loans.map((l) => {
              const plan = loanPlan(l);
              return (
                <button key={l.id} type="button" onClick={() => ed.start(l)} className="w-full text-left px-4 sm:px-5 py-3 hover:bg-stone-50 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink truncate">{l.name}</span>
                      <Badge>{labelOf(LIABILITY_TYPES, l.type)}</Badge>
                      {l.interestRate > 0 && <Badge tone={TONES.amber}>{l.interestRate}% p.a.</Badge>}
                    </div>
                    <div className="text-xs text-stone-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {l.emi > 0 && <span>EMI {formatMoney(l.emi, l.currency)}</span>}
                      {l.remainingMonths != null && <span>{l.remainingMonths} months left (as entered)</span>}
                      {l.nextPaymentDate && <span>Next payment {formatDay(l.nextPaymentDate)}</span>}
                      {l.outstanding > 0 &&
                        (Number.isFinite(plan.months) ? (
                          <span className="text-ink">
                            Paid off ≈ {plan.payoffDate ? formatDay(plan.payoffDate) : 'now'} · interest left ≈ {formatMoney(plan.interest, l.currency)}
                          </span>
                        ) : l.emi > 0 ? (
                          <span className="text-rose-700">Payment doesn't cover interest — balance won't clear</span>
                        ) : (
                          <span>Add a monthly payment to estimate the payoff date</span>
                        ))}
                    </div>
                  </div>
                  <Amount value={l.outstanding} currency={l.currency} base={base} rates={rates} />
                </button>
              );
            })}
          </div>
        )}
      </Section>
      {loans.some((l) => l.outstanding > 0 && l.emi > 0) && <PrepayTool loans={loans} settings={settings} />}
      <LiabilityForm
        open={ed.open}
        record={ed.record}
        currencies={currencies}
        defaultCurrency={base}
        onSave={ed.record ? w.update('liabilities', ed.record.id) : w.create('liabilities')}
        onDelete={ed.record && w.remove('liabilities', ed.record.id)}
        onClose={ed.close}
      />
    </div>
  );
}

function PrepayTool({ loans, settings }) {
  const eligible = loans.filter((l) => l.outstanding > 0 && l.emi > 0 && Number.isFinite(loanPlan(l).months));
  const [loanId, setLoanId] = useState(eligible[0]?.id);
  const [amount, setAmount] = useState('');
  const [ret, setRet] = useState(String(settings.scenarios?.moderate?.expectedReturn ?? 8));
  const loan = eligible.find((l) => l.id === loanId) || eligible[0];
  if (!loan) return null;
  const result = prepayVsInvest(loan, Number(amount) || 0, Number(ret) || 0);
  const fmt = (x) => formatMoney(x, loan.currency);
  const years = (m) => (m >= 12 ? `${(m / 12).toFixed(1)} years` : `${m.toFixed(1)} months`);

  return (
    <Section title="Prepay the loan or invest instead?" icon={HandCoins} subtitle="Compares both choices over the loan's remaining term, ignoring taxes and fees.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Loan</span>
          <select className={inputClass} value={loan.id} onChange={(e) => setLoanId(e.target.value)}>
            {eligible.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.interestRate}%)</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Extra amount ({loan.currency})</span>
          <input type="number" min="0" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 20000" />
        </label>
        <label className="block">
          <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Expected investment return (% / yr)</span>
          <input type="number" min="0" step="0.1" className={inputClass} value={ret} onChange={(e) => setRet(e.target.value)} />
        </label>
      </div>
      {result ? (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {[
            {
              key: 'prepay',
              title: 'Prepay now',
              value: result.prepayWealth,
              lines: [
                `Loan closes ${years(result.monthsSaved)} sooner and saves ${fmt(result.interestSaved)} in interest.`,
                `The freed-up EMI (${fmt(loan.emi)}) is then invested monthly until the original end date.`,
              ],
            },
            {
              key: 'invest',
              title: 'Invest instead',
              value: result.investWealth,
              lines: [
                `${fmt(result.amount)} grows at ${ret}% a year for ${years(result.horizonMonths)}.`,
                'The loan keeps running on its normal schedule.',
              ],
            },
          ].map((o) => (
            <div key={o.key} className={cx('rounded-xl border-[1.5px] p-3.5', result.better === o.key ? 'border-ink bg-taxi-soft' : 'border-stone-200')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{o.title}</span>
                {result.better === o.key && <Badge tone={TONES.emerald} icon={BadgeCheck} upper>Better</Badge>}
              </div>
              <div className="text-2xl font-extrabold text-ink mt-1 tabular-nums">{fmt(o.value)}</div>
              <div className="text-[11px] text-stone-500">wealth built by the original payoff date</div>
              <ul className="text-xs text-stone-600 mt-2 space-y-1 list-disc pl-4">
                {o.lines.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-stone-500 mt-3">Enter an extra amount to compare.</p>
      )}
    </Section>
  );
}

/* ---------- Lent & borrowed ---------- */

function Debts({ w, data, base, rates, currencies, money, t }) {
  const ed = useEditor();
  const [direction, setDirection] = useState('lent');
  const [showSettled, setShowSettled] = useState(false);
  const debts = data.debts || [];
  const settledCount = debts.filter((d) => debtStatus(d).settled).length;
  const add = (dir) => {
    setDirection(dir);
    ed.start('new');
  };
  // Records the whole outstanding amount as repaid today.
  const settle = (d) => {
    const st = debtStatus(d);
    if (!window.confirm(`Mark ${formatMoney(st.outstanding, d.currency)} as repaid today?`)) return;
    w.update('debts', d.id)({ repayments: [...(d.repayments || []), { date: todayStr(), amount: st.outstanding, note: 'Settled' }] });
  };

  const column = (dir) => {
    const lent = dir === 'lent';
    const list = debts
      .filter((d) => d.direction === dir && (showSettled || !debtStatus(d).settled))
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    return (
      <Section
        block
        tint={lent ? 'green' : 'red'}
        title={lent ? 'Owed to me' : 'I have to pay'}
        icon={lent ? ArrowDownLeft : ArrowUpRight}
        subtitle={lent ? 'Money you lent to people. Counts as an asset.' : 'Money you borrowed from people. Counts as a liability.'}
        chip={money(lent ? t.lent : t.borrowed)}
        flush
      >
        <div className="flex justify-end px-4 pt-3">
          <Button variant="soft" icon={Plus} onClick={() => add(dir)}>{lent ? 'Lent money' : 'Borrowed money'}</Button>
        </div>
        {list.length === 0 ? (
          <div className="p-4">
            <EmptyState text={lent ? 'Nobody owes you money right now.' : 'You owe nobody money right now.'} />
          </div>
        ) : (
          <div className="divide-y-[1.5px] divide-ink/10">
            {list.map((d) => {
              const st = debtStatus(d);
              return (
                <div key={d.id} className={cx('px-4 py-3', st.settled && 'opacity-60')}>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3">
                    <span className="w-8 h-8 rounded-[7px] border-[1.5px] border-ink bg-white flex items-center justify-center font-mono text-xs font-semibold text-ink">
                      {d.person.charAt(0).toUpperCase()}
                    </span>
                    <button type="button" onClick={() => ed.start(d)} className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink truncate hover:text-zone-blue">{d.person}</span>
                        {st.settled && <Badge tone={TONES.emerald} icon={BadgeCheck} upper>Settled</Badge>}
                        {st.overdue && <Badge tone={TONES.rose} icon={CircleAlert} upper>Overdue</Badge>}
                      </div>
                      <div className="text-xs text-stone-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {formatMoney(d.amount, d.currency)}
                          {d.date && ` on ${formatDay(d.date)}`}
                        </span>
                        {st.repaid > 0 && !st.settled && <span>{formatMoney(st.repaid, d.currency)} repaid</span>}
                        {d.dueDate && !st.settled && (
                          <span className={st.overdue ? 'text-rose-700 font-semibold' : ''}>
                            Due {formatDay(d.dueDate)}
                            {st.daysLeft >= 0 && st.daysLeft <= 30 && ` (${st.daysLeft === 0 ? 'today' : `${st.daysLeft} days`})`}
                          </span>
                        )}
                        {d.note && <span className="truncate max-w-full">{d.note}</span>}
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <Amount value={st.outstanding} currency={d.currency} base={base} rates={rates} />
                      {!st.settled && (
                        <Button variant="soft" icon={BadgeCheck} className="mt-1 px-2.5! py-1!" onClick={() => settle(d)}>
                          Mark repaid
                        </Button>
                      )}
                    </div>
                  </div>
                  {!st.settled && st.repaid > 0 && (
                    <div className="mt-2 pl-11">
                      <ProgressBar thin percent={(st.repaid / d.amount) * 100} color="#3bb57c" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">Net position with people</div>
          <div className={cx('font-display text-3xl font-extrabold tracking-tight tabular-nums', t.lent - t.borrowed < 0 ? 'text-rose-700' : 'text-ink')}>
            {money(t.lent - t.borrowed, { signed: true })}
          </div>
        </div>
        <p className="text-xs text-stone-500 flex-1 min-w-48">Owed to you − what you owe. Only what is still outstanding after repayments counts in net worth.</p>
        {settledCount > 0 && (
          <label className="flex items-center gap-2 font-mono text-xs font-semibold text-stone-600 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-ink" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
            Show settled ({settledCount})
          </label>
        )}
      </Card>
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {column('lent')}
        {column('borrowed')}
      </div>
      <DebtForm
        open={ed.open}
        record={ed.record}
        defaults={{ direction, currency: base }}
        currencies={currencies}
        onSave={ed.record ? w.update('debts', ed.record.id) : w.create('debts')}
        onDelete={ed.record && w.remove('debts', ed.record.id)}
        onClose={ed.close}
      />
    </div>
  );
}

/* ---------- Income & expenses ---------- */

function CashFlow({ w, data, base, rates, currencies, money, now }) {
  const [month, setMonth] = useState(now);
  const entryEd = useEditor();
  const budgetEd = useEditor();
  const [kind, setKind] = useState('expense');
  const tot = monthTotals(data.entries, month, base, rates);
  const cats = expensesByCategory(data.entries, month, base, rates);
  const bva = budgetVsActual(data.entries, data.budgets, month, base, rates);
  const commit = commitments(data.entries, data.liabilities, month, base, rates);
  const entries = data.entries.filter((e) => e.month === month).sort((a, b) => a.kind.localeCompare(b.kind) || b.amount - a.amount);
  // The last six months, unless the picked month falls outside them; clicking a column picks that month.
  const end = month > now || month < addMonths(now, -5) ? month : now;
  const history = Array.from({ length: 6 }, (_, i) => addMonths(end, i - 5)).map((m) => {
    const x = monthTotals(data.entries, m, base, rates);
    return { month: m, label: formatMonth(m, true), income: x.income, expenses: x.expenses, savings: x.savings };
  });
  const overBudget = new Set(bva.filter((b) => b.over).map((b) => b.category));
  const prevRecurring = data.entries.filter((e) => e.month === addMonths(month, -1) && e.recurring);
  const [copying, setCopying] = useState(false);

  const copyRecurring = async () => {
    setCopying(true);
    for (const e of prevRecurring) {
      const { kind: k, category, amount, currency, note } = e;
      await w.create('entries')({ month, kind: k, category, amount, currency, note, recurring: true });
    }
    setCopying(false);
  };
  const addEntry = (k) => {
    setKind(k);
    entryEd.start('new');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-500">
          Month
          <input type="month" className={cx(selectClass, 'py-1.5!')} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {prevRecurring.length > 0 && !entries.some((e) => e.recurring) && (
            <Button variant="soft" icon={Copy} disabled={copying} onClick={copyRecurring}>
              Copy {prevRecurring.length} recurring from {formatMonth(addMonths(month, -1), true)}
            </Button>
          )}
          <Button variant="soft" icon={Plus} onClick={() => addEntry('income')}>Income</Button>
          <Button icon={Plus} onClick={() => addEntry('expense')}>Expense</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Income · ${formatMonth(month, true)}`} zone="bg-zone-green" value={money(tot.income, { compact: true })} />
        <Stat label={`Expenses · ${formatMonth(month, true)}`} zone="bg-zone-orange" value={money(tot.expenses, { compact: true })} />
        <Stat label="Saved" zone="bg-zone-blue" value={money(tot.savings, { compact: true })} negative={tot.savings < 0} note="Income − expenses" />
        <Stat label="Savings rate" zone="bg-taxi" value={formatPct(tot.rate)} note="Saved ÷ income" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section block title="Monthly cash flow" icon={ArrowRightLeft} subtitle="Click a month to see its details.">
          <Legend
            className="mb-2"
            items={[
              { label: 'Income', color: SERIES[2] },
              { label: 'Expenses', color: SERIES[1] },
            ]}
          />
          <ColumnChart
            ariaLabel="Income and expenses by month"
            groups={history}
            series={[
              { key: 'income', label: 'Income', color: SERIES[2] },
              { key: 'expenses', label: 'Expenses', color: SERIES[1] },
            ]}
            format={(x) => money(x)}
            formatTick={(x) => money(x, { compact: true })}
            selected={history.findIndex((g) => g.month === month)}
            onSelect={(i) => setMonth(history[i].month)}
            extra={(g) => (
              <div className="mt-1 pt-1 border-t border-stone-200 flex justify-between">
                <span className="text-stone-600">Saved</span>
                <span className={cx('font-semibold tabular-nums', g.savings < 0 ? 'text-rose-700' : 'text-ink')}>{money(g.savings)}</span>
              </div>
            )}
          />
        </Section>
        <Section title="Where the money went" icon={PiggyBank} subtitle={`Expenses by category, ${formatMonth(month)}`}>
          {cats.length ? (
            <div className="space-y-2.5">
              {cats.map((c, i) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">
                      {c.category}
                      {overBudget.has(c.category) && (
                        <span className="ml-2 rounded px-1.5 py-px bg-rose-600 text-white font-mono text-[9px] font-semibold uppercase tracking-wider">Over budget</span>
                      )}
                      {i === 0 && cats.length > 1 && <span className="ml-2 font-mono text-[10px] uppercase text-stone-500">Largest</span>}
                    </span>
                    <span className="tabular-nums text-stone-700">
                      {money(c.amount)} · {formatPct(c.amount / tot.expenses, 0)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar thin percent={(c.amount / cats[0].amount) * 100} color={overBudget.has(c.category) ? '#d93a2b' : '#4c76ff'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No expenses recorded for this month." />
          )}
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section
          title="Budget vs actual"
          icon={Scale}
          subtitle={formatMonth(month)}
          action={<Button variant="ghost" icon={Plus} onClick={() => budgetEd.start('new')}>Budget</Button>}
        >
          {bva.length ? (
            <div className="space-y-3">
              {bva.map((b) => (
                <div key={b.id}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button type="button" onClick={() => budgetEd.start(data.budgets.find((x) => x.id === b.id))} className="font-semibold text-ink hover:text-zone-blue inline-flex items-center gap-1.5">
                      {b.category}
                      <Pencil className="w-3 h-3 text-stone-400" />
                    </button>
                    <span className="tabular-nums text-stone-700">
                      {money(b.spent)} of {money(b.budget)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <LimitBar value={b.spent} limit={b.budget} />
                  </div>
                  <div className={cx('text-[11px] mt-0.5', b.over ? 'text-rose-700 font-semibold' : 'text-stone-500')}>
                    {b.over ? (
                      <span className="inline-flex items-center gap-1">
                        <CircleAlert className="w-3 h-3" /> Over by {money(-b.left)}
                      </span>
                    ) : (
                      `${money(b.left)} left`
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Set monthly budgets per expense category to compare against actual spending." />
          )}
        </Section>
        <Section title="Monthly commitments" icon={CalendarClock} subtitle="Loan EMIs plus recurring expenses.">
          {commit.items.length ? (
            <>
              <div className="divide-y divide-stone-100">
                {commit.items.map((c) => (
                  <div key={`${c.source}-${c.id}`} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-ink">
                      {c.name} <span className="text-stone-400">· {c.source}</span>
                    </span>
                    <span className="tabular-nums font-semibold text-ink">{money(c.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 mt-1 border-t-[1.5px] border-stone-200 text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums">{money(commit.total)}</span>
              </div>
              {tot.income > 0 && <p className="text-[11px] text-stone-500 mt-1">{formatPct(commit.total / tot.income)} of this month's income.</p>}
              <p className="text-[11px] text-stone-400 mt-1">EMIs come from your liabilities, so expense lines in “Loan EMI” are not added again.</p>
            </>
          ) : (
            <EmptyState text="No loans with an EMI and no recurring expenses this month." />
          )}
        </Section>
      </div>

      <Section title={`Entries · ${formatMonth(month)}`} icon={Receipt}>
        {entries.length ? (
          <div className="divide-y divide-stone-200 -mx-4 sm:-mx-5">
            {entries.map((e) => (
              <button key={e.id} type="button" onClick={() => entryEd.start(e)} className="w-full text-left px-4 sm:px-5 py-2.5 hover:bg-stone-50 flex items-center gap-3">
                <Badge tone={e.kind === 'income' ? TONES.emerald : TONES.stone} upper>{e.kind}</Badge>
                <span className="flex-1 min-w-0 text-sm text-ink truncate">
                  {e.category}
                  {e.note && <span className="text-stone-500"> · {e.note}</span>}
                  {e.recurring && <span className="ml-2 font-mono text-[10px] uppercase text-stone-500">Recurring</span>}
                </span>
                <Amount value={e.amount} currency={e.currency} base={base} rates={rates} className="text-sm" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text="Add this month's income and expenses to see savings and budgets." />
        )}
      </Section>

      <EntryForm
        open={entryEd.open}
        record={entryEd.record}
        defaults={{ month, kind, currency: base }}
        currencies={currencies}
        onSave={entryEd.record ? w.update('entries', entryEd.record.id) : w.create('entries')}
        onDelete={entryEd.record && w.remove('entries', entryEd.record.id)}
        onClose={entryEd.close}
      />
      <BudgetForm
        open={budgetEd.open}
        record={budgetEd.record}
        currencies={currencies}
        defaultCurrency={base}
        usedCategories={data.budgets.map((b) => b.category)}
        onSave={budgetEd.record ? w.update('budgets', budgetEd.record.id) : w.create('budgets')}
        onDelete={budgetEd.record && w.remove('budgets', budgetEd.record.id)}
        onClose={budgetEd.close}
      />
    </div>
  );
}

/* ---------- Goals ---------- */

function Goals({ w, data, base, rates, currencies, t }) {
  const ed = useEditor();
  return (
    <>
      <Section
        title="Financial goals"
        icon={Flag}
        subtitle="Estimates use your planned monthly contribution only, without investment growth."
        action={<Button icon={Plus} onClick={() => ed.start('new')}>Add goal</Button>}
      >
        {data.goals.length ? (
          <div className="grid md:grid-cols-2 gap-3">
            {data.goals.map((g) => {
              const p = goalProgress(g, convert(t.netWorth, base, g.currency, rates));
              const fmt = (x) => formatMoney(x, g.currency);
              return (
                <div key={g.id} className={cx('rounded-xl border-[1.5px] p-4', p.behind ? 'border-amber-400' : 'border-stone-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink truncate">{g.name}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Badge>{labelOf(GOAL_TYPES, g.type)}</Badge>
                        {p.done && <Badge tone={TONES.emerald} icon={BadgeCheck} upper>Reached</Badge>}
                        {p.behind && <Badge tone={TONES.amber} icon={TriangleAlert} upper>Behind</Badge>}
                      </div>
                    </div>
                    <IconButton icon={Pencil} label="Edit goal" onClick={() => ed.start(g)} />
                  </div>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-lg font-extrabold text-ink tabular-nums">{fmt(p.current)}</span>
                    <span className="text-xs text-stone-500 tabular-nums">of {fmt(g.targetAmount)} · {formatPct(p.percent, 0)}</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar percent={p.percent * 100} color={p.behind ? '#eda100' : '#1baf7a'} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-xs">
                    <dt className="text-stone-500">Remaining</dt>
                    <dd className="text-right font-semibold text-ink tabular-nums">{fmt(p.remaining)}</dd>
                    <dt className="text-stone-500">Monthly contribution</dt>
                    <dd className="text-right text-ink tabular-nums">{fmt(g.monthlyContribution)}</dd>
                    {g.targetDate && (
                      <>
                        <dt className="text-stone-500">Target date</dt>
                        <dd className="text-right text-ink">{formatDay(g.targetDate)}</dd>
                      </>
                    )}
                    {p.required != null && !p.done && (
                      <>
                        <dt className="text-stone-500">Needed per month</dt>
                        <dd className={cx('text-right tabular-nums', p.behind ? 'text-amber-700 font-semibold' : 'text-ink')}>{fmt(p.required)}</dd>
                      </>
                    )}
                    {!p.done && (
                      <>
                        <dt className="text-stone-500">Estimated completion</dt>
                        <dd className="text-right text-ink">{p.eta ? formatDay(p.eta) : 'Add a monthly contribution'}</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Flag} title="No goals yet" text="Add an emergency fund, property, education, retirement, debt or net-worth goal." />
        )}
      </Section>
      <GoalForm
        open={ed.open}
        record={ed.record}
        currencies={currencies}
        defaultCurrency={base}
        onSave={ed.record ? w.update('goals', ed.record.id) : w.create('goals')}
        onDelete={ed.record && w.remove('goals', ed.record.id)}
        onClose={ed.close}
      />
    </>
  );
}

/* ---------- Forecast ---------- */

function Forecast({ w, data, settings, money, t, avg }) {
  const [form, setForm] = useState(() => draftOf(settings));
  const [real, setReal] = useState(false);
  useEffect(() => setForm(draftOf(settings)), [settings]);
  const draft = { ...settings, ...parseDraft(form) };
  const runs = SCENARIOS.map((s) => ({ ...s, rate: draft.scenarios[s.key].expectedReturn, result: forecast({ ...data, settings: draft }, t, avg, draft.scenarios[s.key].expectedReturn) }));
  const key = real ? 'real' : 'netWorth';
  const points = runs[0].result.points.map((p, i) => ({
    label: i === 0 ? 'Now' : `Yr ${p.year}`,
    ...Object.fromEntries(runs.map((r) => [r.key, r.result.points[i][key]])),
  }));
  const milestones = [5, 10, 15, 20, 30, 40, 50].filter((y) => y <= draft.forecastYears);
  if (!milestones.includes(draft.forecastYears)) milestones.push(draft.forecastYears);
  const dirty = JSON.stringify(parseDraft(form)) !== JSON.stringify(parseDraft(draftOf(settings)));
  const fiYear = (m) => new Date().getFullYear() + Math.ceil(m / 12);

  const field = (label, k, suffix, step = '0.1') => (
    <label className="block">
      <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">{label}</span>
      <div className="relative">
        <input type="number" step={step} min="0" className={cx(inputClass, suffix && 'pr-20')} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-400 pointer-events-none">{suffix}</span>}
      </div>
    </label>
  );

  return (
    <div className="space-y-4">
      <Section
        title="Wealth forecast"
        icon={TrendingUp}
        subtitle={`Starts from today's net worth (${money(t.netWorth)}) and average monthly savings of ${money(avg.savings)} (last ${avg.months || 0} month${avg.months === 1 ? '' : 's'} of entries).`}
        action={<Segmented value={real ? 'real' : 'nominal'} onChange={(v) => setReal(v === 'real')} options={[{ key: 'nominal', label: 'Nominal' }, { key: 'real', label: "Today's money" }]} />}
      >
        <Legend className="mb-2" items={runs.map((r) => ({ label: `${r.label} · ${r.rate}%`, color: r.color, line: true }))} />
        <LineChart
          ariaLabel="Projected net worth by scenario"
          points={points}
          series={runs.map((r) => ({ key: r.key, label: r.label, color: r.color }))}
          format={(x) => money(x)}
          formatTick={(x) => money(x, { compact: true })}
          height={260}
        />
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-stone-500 text-left">
                <th className="py-1.5 pr-3 font-semibold">Scenario</th>
                {milestones.map((y) => <th key={y} className="py-1.5 pr-3 font-semibold text-right">{y} yrs</th>)}
                <th className="py-1.5 font-semibold text-right">Financial independence</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.key} className="border-t border-stone-100">
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: r.color }} />
                      {r.label}
                    </span>
                  </td>
                  {milestones.map((y) => (
                    <td key={y} className="py-1.5 pr-3 text-right tabular-nums text-ink">{money(r.result.points[y]?.[key], { compact: true })}</td>
                  ))}
                  <td className="py-1.5 text-right text-ink">
                    {r.result.annualExpenses <= 0
                      ? 'Add expenses'
                      : r.result.fiMonth == null
                        ? `Beyond ${draft.forecastYears} yrs`
                        : r.result.fiMonth === 0
                          ? 'Already'
                          : `~${fiYear(r.result.fiMonth)} (${(r.result.fiMonth / 12).toFixed(1)} yrs)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 text-[11px] text-stone-500 space-y-1 list-disc pl-4">
          <li>Each month: investments grow at the scenario return and receive that month's savings; cash stays flat; property rises with inflation; each loan is paid down by its EMI.</li>
          <li>Savings rise by {draft.savingsGrowth}% a year. They are taken after EMIs, so record EMI payments as “Loan EMI” expenses.</li>
          <li>“Today's money” divides each value by (1 + inflation)^years at {draft.inflation}% inflation.</li>
          <li>
            Financial independence: investable assets{draft.excludeHomeFromFi ? ' (excluding real estate)' : ''} minus all debt reach yearly expenses
            ({money(avg.expenses * 12)}, rising with inflation) ÷ {draft.withdrawalRate}% withdrawal rate.
          </li>
        </ul>
      </Section>

      <Section
        title="Assumptions"
        icon={Scale}
        subtitle="Change them to see the forecast update; save to keep them."
        action={dirty && <Button onClick={() => w.saveSettings(parseDraft(form))}>Save assumptions</Button>}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {field('Conservative return', 'conservative', '% / yr')}
          {field('Moderate return', 'moderate', '% / yr')}
          {field('Optimistic return', 'optimistic', '% / yr')}
          {field('Inflation', 'inflation', '% / yr')}
          {field('Savings growth', 'savingsGrowth', '% / yr')}
          {field('Withdrawal rate', 'withdrawalRate', '%')}
          {field('Years to project', 'forecastYears', 'yrs', '1')}
          <label className="flex items-center gap-2 self-end pb-2.5 text-xs font-semibold text-stone-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.excludeHomeFromFi} onChange={(e) => setForm((f) => ({ ...f, excludeHomeFromFi: e.target.checked }))} />
            Exclude real estate from investable assets
          </label>
        </div>
      </Section>
    </div>
  );
}

const draftOf = (s) => ({
  conservative: String(s.scenarios.conservative.expectedReturn),
  moderate: String(s.scenarios.moderate.expectedReturn),
  optimistic: String(s.scenarios.optimistic.expectedReturn),
  inflation: String(s.inflation),
  savingsGrowth: String(s.savingsGrowth),
  withdrawalRate: String(s.withdrawalRate),
  forecastYears: String(s.forecastYears),
  excludeHomeFromFi: s.excludeHomeFromFi,
});
const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const parseDraft = (f) => ({
  scenarios: {
    conservative: { expectedReturn: clamp(f.conservative, 0, 100, 5) },
    moderate: { expectedReturn: clamp(f.moderate, 0, 100, 8) },
    optimistic: { expectedReturn: clamp(f.optimistic, 0, 100, 11) },
  },
  inflation: clamp(f.inflation, 0, 100, 4),
  savingsGrowth: clamp(f.savingsGrowth, 0, 100, 3),
  withdrawalRate: clamp(f.withdrawalRate, 1, 10, 4),
  forecastYears: Math.round(clamp(f.forecastYears, 1, 50, 20)),
  excludeHomeFromFi: f.excludeHomeFromFi,
});

/* ---------- Currencies ---------- */

function Currencies({ w, settings, currencies }) {
  const [rates, setRates] = useState(() => toDraft(settings.rates));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setRates(toDraft(settings.rates)), [settings.rates]);
  const parsed = Object.fromEntries(Object.entries(rates).map(([c, v]) => [c, Number(v)]));
  const invalid = Object.entries(parsed).filter(([, v]) => !(v > 0)).map(([c]) => c);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(Object.fromEntries(Object.entries(toDraft(settings.rates)).map(([c, v]) => [c, Number(v)])));

  const add = () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return setError('Use a 3-letter currency code, e.g. QAR');
    if (c === 'AED' || rates[c] != null) return setError(`${c} is already listed`);
    try {
      new Intl.NumberFormat(undefined, { style: 'currency', currency: c });
    } catch {
      return setError(`${c} isn't a currency code this browser knows`);
    }
    setRates((r) => ({ ...r, [c]: '' }));
    setCode('');
    setError('');
  };

  return (
    <Section
      title="Currencies & exchange rates"
      icon={Coins}
      subtitle={`Every record keeps its own currency and is converted to ${settings.baseCurrency} for totals using these rates. There's no live feed, so update them when rates move.`}
      action={dirty && <Button disabled={invalid.length > 0} onClick={() => w.saveSettings({ rates: parsed })}>Save rates</Button>}
    >
      <div className="max-w-lg">
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          <div className="flex items-center gap-3 py-2 text-sm">
            <span className="w-14 font-mono font-semibold text-ink">AED</span>
            <span className="flex-1 text-stone-500 text-xs">Pivot currency, always 1</span>
          </div>
          {Object.keys(rates).sort().map((c) => (
            <div key={c} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-14 font-mono font-semibold text-ink">{c}</span>
              <span className="text-xs text-stone-500 whitespace-nowrap">1 {c} =</span>
              <input
                type="number"
                min="0"
                step="any"
                className={cx(inputClass, 'py-1.5!', !(Number(rates[c]) > 0) && 'border-rose-500!')}
                value={rates[c]}
                onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))}
                aria-label={`Value of 1 ${c} in AED`}
              />
              <span className="text-xs text-stone-500">AED</span>
              {Number(rates[c]) > 0 && <span className="hidden sm:inline text-[11px] text-stone-400 whitespace-nowrap">1 AED = {(1 / Number(rates[c])).toFixed(4)} {c}</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <input className={cx(inputClass, 'w-32! uppercase')} maxLength={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" aria-label="New currency code" />
          <Button variant="soft" icon={Plus} onClick={add}>Add currency</Button>
        </div>
        {error && <p className="text-xs font-medium text-rose-600 mt-2">{error}</p>}
        {invalid.length > 0 && <p className="text-xs font-medium text-rose-600 mt-2">Enter a rate above 0 for {invalid.join(', ')}.</p>}
        <p className="text-[11px] text-stone-400 mt-3">Available in forms: {currencies.join(', ')}.</p>
      </div>
    </Section>
  );
}

const toDraft = (rates) => Object.fromEntries(Object.entries(rates || {}).filter(([c]) => c !== 'AED').map(([c, v]) => [c, String(v)]));
