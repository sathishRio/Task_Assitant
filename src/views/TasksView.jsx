import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Bell, Plus, Search, Zap } from 'lucide-react';
import { useStore } from '../store';
import { MODES, PRIORITIES, modeOf, priorityOf } from '../theme';
import { isOverdue, todayStr } from '../dates';
import { Button, Card, EmptyState, InsightCard, MetricCard, ModeSwitch, PageHero, TaskItem, cx, inputClass, selectClass } from '../ui';
import { TaskForm } from '../forms';
import TaskDetails from './TaskDetails';

const TABS = [
  { key: 'open', label: 'All Tasks', test: (t) => t.status !== 'done' },
  { key: 'today', label: 'Due Today', test: (t) => t.status !== 'done' && t.dueDate === todayStr() },
  { key: 'upcoming', label: 'Upcoming', test: (t) => t.status !== 'done' && !!t.dueDate && t.dueDate > todayStr() },
  { key: 'in_progress', label: 'In Progress', test: (t) => t.status === 'in_progress' },
  { key: 'done', label: 'Completed', test: (t) => t.status === 'done' },
  { key: 'all', label: 'Everything', test: () => true },
];

const SORTS = [
  { key: 'due', label: 'Due Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'title', label: 'Title (A–Z)' },
];

// Open tasks first; then by the chosen key, falling back to due date and priority.
const byDue = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
const byPriority = (a, b) => priorityOf(a.priority).rank - priorityOf(b.priority).rank;
const comparators = {
  due: (a, b) => byDue(a, b) || byPriority(a, b),
  priority: (a, b) => byPriority(a, b) || byDue(a, b),
  title: (a, b) => a.title.localeCompare(b.title),
};
const sortTasks = (sort) => (a, b) => {
  const doneA = a.status === 'done' ? 1 : 0;
  const doneB = b.status === 'done' ? 1 : 0;
  if (doneA !== doneB) return doneA - doneB;
  // Pinned open tasks come first.
  if (!doneA && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  if (doneA && sort === 'due') return (b.completedAt || '').localeCompare(a.completedAt || '');
  return comparators[sort](a, b);
};

const TIPS = [
  ['Set Reminders Intentionally', 'Schedule reminders 15–30 mins prior to when you realistically intend to start.'],
  ['Single-Tasking Priority', 'Keep only 1 high-priority task active at any time to prevent cognitive overload.'],
  ['Daily Shutdown Review', "Clear today's checked items and set tomorrow's priorities the evening prior."],
];

// `preset` lets other views open this list pre-filtered, e.g. { categoryId } from Categories.
export default function TasksView({ preset }) {
  const { state, actions } = useStore();
  const { categories, phases, mode } = state;
  // Everything below works on the active workspace (Office or Personal) only.
  const tasks = useMemo(() => state.tasks.filter((t) => modeOf(t) === mode), [state.tasks, mode]);
  const modeCounts = useMemo(
    () => Object.fromEntries(MODES.map((m) => [m.key, state.tasks.filter((t) => modeOf(t) === m.key && t.status !== 'done').length])),
    [state.tasks],
  );
  const modeLabel = MODES.find((m) => m.key === mode).label;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('open');
  const [categoryId, setCategoryId] = useState('all');
  const [priority, setPriority] = useState('all');
  const [phaseId, setPhaseId] = useState('all');
  const [sort, setSort] = useState('due');
  const [showBackground, setShowBackground] = useState(false);
  const [viewingId, setViewingId] = useState(null); // task shown in the right-hand details panel
  const [editing, setEditing] = useState(null); // task | 'new' | { title } (reminder from quick add) | null
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState('medium');
  const [quickCategory, setQuickCategory] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (!preset) return;
    setTab(TABS.some((t) => t.key === preset.status) ? preset.status : 'open');
    setCategoryId(preset.categoryId || 'all');
    setPhaseId(preset.phaseId || 'all');
    setPriority('all');
    setQuery('');
    // Home's Search button: jump straight into the search box.
    if (preset.focusSearch) {
      searchRef.current?.scrollIntoView({ block: 'center' });
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [preset]);

  // Actions are listed under their main objective rather than as rows of their own.
  const actionsOf = useMemo(() => {
    const map = {};
    tasks.forEach((t) => t.parentId && (map[t.parentId] ||= []).push(t));
    Object.values(map).forEach((list) => list.sort(sortTasks('due')));
    return map;
  }, [tasks]);
  // Background tasks stay out of the list until "Show background" is ticked.
  const roots = useMemo(() => tasks.filter((t) => !t.parentId && (showBackground || !t.background)), [tasks, showBackground]);
  // A row shows when the task, or any of its actions, passes the test.
  const rowMatches = (test) => (t) => test(t) || (actionsOf[t.id] || []).some(test);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, roots.filter(rowMatches(t.test)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roots, actionsOf],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inTab = TABS.find((t) => t.key === tab).test;
    const matches = (t) => {
      if (!inTab(t)) return false;
      if (categoryId === 'none' ? t.categoryId : categoryId !== 'all' && t.categoryId !== categoryId) return false;
      if (priority !== 'all' && t.priority !== priority) return false;
      if (phaseId !== 'all' && t.phaseId !== phaseId) return false;
      if (q && !`${t.title} ${t.notes}`.toLowerCase().includes(q)) return false;
      return true;
    };
    return roots.filter(rowMatches(matches)).sort(sortTasks(sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, actionsOf, query, tab, categoryId, priority, phaseId, sort]);

  const catById = (id) => categories.find((c) => c.id === id);
  const phaseById = (id) => phases.find((p) => p.id === id);

  // Hero metrics
  const today = todayStr();
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const todays = tasks.filter((t) => t.dueDate === today);
  const todaysDone = todays.filter((t) => t.status === 'done').length;
  const reminders = tasks.filter((t) => t.reminder && t.status !== 'done' && t.dueDate && t.dueDate >= today).length;
  const overdue = tasks.filter(isOverdue);
  const highOpen = tasks.filter((t) => t.priority === 'high' && t.status !== 'done');
  const urgent = new Set([...overdue, ...highOpen].map((t) => t.id)).size;

  const quickAdd = async (e) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    const created = await actions.createTask({
      title, priority: quickPriority, categoryId: quickCategory || null, status: 'todo', notes: '',
      reminder: false, dueDate: null, dueTime: null, phaseId: null, topicId: null, mode,
    });
    if (created) setQuickTitle('');
  };

  const fromQuickAdd = editing && editing !== 'new' && !editing.id;

  return (
    <>
      <PageHero
        icon={Zap}
        eyebrow="Actionable Execution Engine"
        title="Task Tracker & Reminders"
        description="Organize daily commitments, track execution momentum, and stay on schedule with timely reminders."
        actions={
          <div className="flex flex-col items-start sm:items-end gap-2">
            <ModeSwitch value={mode} onChange={actions.setMode} counts={modeCounts} />
            <Button icon={Plus} onClick={() => setEditing('new')}>New Task & Reminder</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <MetricCard label="Overall progress" value={`${pct}%`} note={`${done} of ${tasks.length} finished`} />
          <MetricCard
            label="Today's focus"
            value={todays.length - todaysDone}
            suffix={`(${todaysDone} done)`}
            note={`${todays.length - todaysDone} remaining today`}
            onClick={() => setTab('today')}
          />
          <MetricCard icon={Bell} label="Active reminders" value={reminders} valueClass="text-amber-600" note="Scheduled ahead" />
          <MetricCard
            label="Urgent & overdue"
            value={urgent}
            valueClass={urgent ? 'text-rose-600' : 'text-stone-900'}
            note={`${overdue.length} overdue • ${highOpen.length} high prio`}
          />
        </div>
      </PageHero>

      {/* Quick add */}
      <Card className="p-4 mt-4">
        <form onSubmit={quickAdd} className="flex flex-col lg:flex-row gap-2.5">
          <input
            className={cx(inputClass, 'flex-1')}
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={`Add a new ${modeLabel.toLowerCase()} task quickly… (press Enter to save)`}
          />
          <div className="flex flex-wrap gap-2">
            <select className={selectClass} value={quickPriority} onChange={(e) => setQuickPriority(e.target.value)} aria-label="Priority">
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <select className={selectClass} value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)} aria-label="Category">
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button variant="soft" icon={Bell} onClick={() => setEditing({ title: quickTitle })}>Reminder</Button>
            <Button type="submit" variant="dark" disabled={!quickTitle.trim()} className="px-4! py-2! text-xs!">Add Task</Button>
          </div>
        </form>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto py-4 -mx-1 px-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cx(
                'shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition',
                active ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              {t.label}
              <span className={cx('min-w-5 px-1.5 py-0.5 rounded-full text-[10px] font-bold', active ? 'bg-white/20' : 'bg-stone-200 text-stone-700')}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & filters */}
      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input ref={searchRef} className={cx(inputClass, 'pl-10')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" type="search" />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mr-1">Filter by:</span>
          <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category">
            <option value="all">All Domains</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">Uncategorized</option>
          </select>
          <select className={selectClass} value={phaseId} onChange={(e) => setPhaseId(e.target.value)} aria-label="Filter by career goal">
            <option value="all">All Goals</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.title}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={showBackground} onChange={(e) => setShowBackground(e.target.checked)} />
            Show background
          </label>
          <span className="inline-flex items-center gap-1.5 sm:ml-auto text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort tasks">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </span>
        </div>
      </Card>

      <div className="space-y-2.5">
        {filtered.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            category={catById(t.categoryId)}
            phase={phaseById(t.phaseId)}
            onEdit={() => setEditing(t)}
            onOpen={() => setViewingId(t.id)}
            subtasks={actionsOf[t.id] || []}
            onEditAction={setEditing}
            onOpenAction={(a) => setViewingId(a.id)}
          />
        ))}
        {filtered.length === 0 && (
          <EmptyState
            title={tasks.length ? 'No matching tasks' : `No ${modeLabel.toLowerCase()} tasks yet`}
            text={tasks.length ? 'Try another tab or clear the filters.' : 'Add your first task with the quick-add bar above.'}
          />
        )}
      </div>

      <InsightCard
        title="Habit & Task Synchronization Philosophy"
        intro="Habits create recurring neurological momentum, while tasks achieve concrete project outcomes. Linking high-priority tasks to your daily routine eliminates task paralysis and builds compounding productivity."
        tips={TIPS}
      />

      {viewingId && <TaskDetails taskId={viewingId} onOpen={setViewingId} onEdit={setEditing} onClose={() => setViewingId(null)} />}

      <TaskForm
        open={!!editing}
        task={editing?.id ? editing : null}
        // New tasks inherit the active category / goal filter, plus anything typed in quick add.
        defaults={{
          mode,
          categoryId: catById(categoryId) ? categoryId : null,
          phaseId: phaseById(phaseId) ? phaseId : null,
          ...(fromQuickAdd ? { title: editing.title, priority: quickPriority, categoryId: quickCategory || null, dueDate: today, reminder: true } : {}),
        }}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
