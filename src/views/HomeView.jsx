import { useState } from 'react';
import { CalendarClock, CircleCheck, Plus, Search, Target } from 'lucide-react';
import { currentPhase, overallProgress, phaseProgress, useStore } from '../store';
import { CERT_STATUSES, phaseTone } from '../theme';
import { isOverdue, startOfWeek, todayStr } from '../dates';
import { Badge, Button, Card, cx, EmptyState, ProgressBar, TaskRow } from '../ui';
import { CertificationForm, TaskForm } from '../forms';
import PhaseModal from './PhaseModal';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const greeting = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

// Coloured headers that make the day's key panels stand out from the rest.
const ACCENTS = {
  taxi: { head: 'bg-taxi border-ink', body: 'border-l-[6px] border-l-taxi', chip: 'bg-ink text-taxi' },
  blue: { head: 'bg-zone-blue text-white border-ink', body: 'border-l-[6px] border-l-zone-blue', chip: 'bg-white text-zone-blue' },
};

// Panel with a title row and a count chip, as on devobj.com. `accent` (taxi | blue) highlights it.
function Panel({ title, count, children, className, accent, icon: Icon }) {
  const a = ACCENTS[accent];
  return (
    <Card block className={cx('overflow-hidden', a?.body, className)}>
      <div className={cx('flex items-center justify-between gap-3 px-4 py-3 border-b-[1.5px]', a ? a.head : 'border-stone-200')}>
        <h2 className={cx('flex items-center gap-2 text-lg font-bold', a ? '' : 'text-ink')}>
          {Icon && <Icon className="w-5 h-5" />}
          {title}
        </h2>
        {count !== undefined && (
          <span className={cx('font-mono text-[11px] font-semibold rounded-md px-2 py-0.5', a ? a.chip : 'bg-stone-100 text-stone-700')}>{count}</span>
        )}
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value, zone, alert, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'text-left rounded-2xl border-[1.5px] px-4 py-3 transition hover:border-ink',
        alert ? 'bg-rose-50 border-rose-600' : 'bg-white border-stone-300',
      )}
    >
      <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        <span className={cx('w-2.5 h-2.5 rounded-[2px]', zone)} />
        {label}
      </span>
      <span
        className={cx(
          'block mt-1.5 font-display text-3xl font-extrabold tracking-tight tabular-nums leading-none',
          alert ? 'text-rose-700' : 'text-ink',
        )}
      >
        {value}
      </span>
    </button>
  );
}

export default function HomeView({ navigate }) {
  const { state, actions } = useStore();
  const { tasks, categories, phases, profile, certifications = [] } = state;
  const [editing, setEditing] = useState(null); // task | 'new' | null
  const [openPhaseId, setOpenPhaseId] = useState(null);
  const [editingCert, setEditingCert] = useState(null); // cert | 'new' | null
  const certStatus = (key) => CERT_STATUSES.find((c) => c.key === key) || CERT_STATUSES[0];
  const cycleCert = (cert) => {
    const i = CERT_STATUSES.findIndex((c) => c.key === cert.status);
    actions.updateCertification(cert.id, { status: CERT_STATUSES[(i + 1) % CERT_STATUSES.length].key });
  };

  const today = todayStr();
  const date = new Date();
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = tasks.filter(isOverdue);
  const dueToday = open.filter((t) => t.dueDate === today);
  const weekStart = startOfWeek();
  const doneThisWeek = tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= weekStart);

  // Overdue + due today, then today's finished ones (struck through) so the day's list stays complete.
  const byDue = (a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime || '99').localeCompare(b.dueTime || '99');
  const focus = [
    ...open.filter((t) => t.dueDate && t.dueDate <= today).sort(byDue),
    ...tasks.filter((t) => t.status === 'done' && t.dueDate === today),
  ];
  const inProgress = tasks.filter((t) => t.status === 'in_progress' && !focus.includes(t));
  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate > today)
    .sort(byDue)
    .slice(0, 4);

  const overall = overallProgress(phases, tasks);
  const now = currentPhase(phases, tasks);
  const dueCount = dueToday.length + overdue.length;

  const row = (t) => <TaskRow key={t.id} task={t} category={categories.find((c) => c.id === t.categoryId)} onEdit={() => setEditing(t)} />;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-stone-500">
            {DAYS[date.getDay()]} · {date.getDate()} {MONTHS[date.getMonth()]} {date.getFullYear()}
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-ink leading-[1.05] text-balance">
            {greeting(date.getHours())}.{' '}
            {dueCount ? (
              <>
                <span className="hl">
                  {dueCount} {dueCount === 1 ? 'thing' : 'things'}
                </span>{' '}
                due today.
              </>
            ) : (
              <>
                Nothing <span className="hl">due today</span>.
              </>
            )}
          </h1>
        </div>
        <div className="flex gap-2.5">
          <Button variant="soft" icon={Search} className="px-4 py-2.5 text-sm" onClick={() => navigate('tasks', { focusSearch: true })}>
            Search
          </Button>
          <Button icon={Plus} className="text-sm" onClick={() => setEditing('new')}>
            Add task
          </Button>
        </div>
      </div>

      {/* Today at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Open" value={open.length} zone="bg-zone-blue" onClick={() => navigate('tasks')} />
        <Stat
          label="Due today"
          value={dueToday.length}
          zone="bg-taxi shadow-[inset_0_0_0_1px_var(--color-ink)]"
          onClick={() => navigate('tasks', { status: 'today' })}
        />
        <Stat label="Overdue" value={overdue.length} zone="bg-rose-600" alert={overdue.length > 0} onClick={() => navigate('tasks')} />
        <Stat
          label="Done this week"
          value={doneThisWeek.length}
          zone="bg-zone-green"
          onClick={() => navigate('tasks', { status: 'done' })}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Career goal */}
          <button
            type="button"
            onClick={() => navigate('career')}
            className="w-full text-left rounded-2xl border-[1.5px] border-ink bg-ink p-5 shadow-block-taxi transition hover:-translate-y-0.5"
          >
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-on-ink">Career goal · 12-month plan</div>
            <div className="mt-1 font-display text-2xl font-extrabold tracking-[-0.03em] text-white leading-tight">
              {profile?.currentRole ? `${profile.currentRole} → ` : ''}
              {profile?.goal || 'Set your career goal'}
            </div>
            <div className="flex flex-wrap justify-between gap-2 mt-4 mb-2.5 font-mono text-xs text-on-ink tabular-nums">
              <span>
                {now ? `Phase ${now.order} of ${phases.length} · ${now.title}` : phases.length ? 'All phases complete' : 'No phases yet'}
              </span>
              <span>
                <b className="text-taxi">{overall}%</b> of the road
              </span>
            </div>
            <ProgressBar percent={overall} gradient />
          </button>

          {/* Certifications */}
          <Panel
            title="Recommended Certifications Roadmap"
            count={`${certifications.filter((c) => c.status === 'passed').length}/${certifications.length}`}
          >
            <div className="divide-y divide-stone-200">
              {certifications.map((c) => {
                const st = certStatus(c.status);
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditingCert(c)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingCert(c)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md border-[1.5px] border-ink font-mono text-xs font-semibold text-ink">
                          {c.code}
                        </span>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                          {c.optional ? 'Optional' : 'Core'}
                        </span>
                      </div>
                      {c.name && <div className="text-sm text-stone-700 mt-1 truncate">{c.name}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleCert(c);
                      }}
                      title="Move to next status"
                    >
                      <Badge pill tone={st.tone}>
                        {st.label}
                      </Badge>
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setEditingCert('new')}
              className="w-full px-4 py-2.5 border-t-[1.5px] border-stone-200 font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-600 hover:bg-stone-50 hover:text-ink text-left"
            >
              + Add certification
            </button>
          </Panel>
        </div>
        <div className="space-y-5 min-w-0">
          {/* Focus today */}
          <Panel title="Focus today" count={focus.length} accent="taxi" icon={Target}>
            {focus.length ? (
              <div className="divide-y divide-stone-200">{focus.map(row)}</div>
            ) : (
              <div className="p-4">
                <EmptyState icon={CircleCheck} title="All clear" text="Nothing due today. Nice work!" />
              </div>
            )}
          </Panel>

          {/* Coming up */}
          {upcoming.length > 0 && (
            <Panel title="Coming up" count={upcoming.length} accent="blue" icon={CalendarClock}>
              <div className="divide-y divide-stone-200">{upcoming.map(row)}</div>
              <button
                type="button"
                onClick={() => navigate('tasks', { status: 'upcoming' })}
                className="w-full px-4 py-2.5 border-t-[1.5px] border-stone-200 font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-600 hover:bg-stone-50 hover:text-ink text-left"
              >
                All upcoming →
              </button>
            </Panel>
          )}

          {/* Roadmap phases */}
          {phases.length > 0 && (
            <Panel title="Roadmap phases" count={phases.length}>
              <div className="divide-y divide-stone-200">
                {phases.map((p) => {
                  const tone = phaseTone(p);
                  const pr = phaseProgress(p, tasks);
                  const isNow = now?.id === p.id;
                  return (
                    <div key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpenPhaseId(openPhaseId === p.id ? null : p.id)}
                        className={cx(
                          'w-full grid grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition',
                          isNow ? 'bg-taxi-soft' : 'hover:bg-stone-50',
                        )}
                      >
                        <span
                          className="row-span-2 w-7 h-7 rounded-[7px] border-[1.5px] border-ink flex items-center justify-center font-mono text-xs font-semibold text-ink"
                          style={{ backgroundColor: `${tone.accent}26` }}
                        >
                          {p.order}
                        </span>
                        <span className="flex items-center gap-2 min-w-0 text-sm font-semibold text-ink">
                          <span className="truncate">{p.title}</span>
                          {isNow && (
                            <span className="shrink-0 px-1.5 rounded bg-ink text-taxi font-mono text-[10px] font-semibold uppercase tracking-wider">
                              Now
                            </span>
                          )}
                        </span>
                        <span className="row-span-2 text-right font-mono text-xs font-semibold text-stone-700 tabular-nums">
                          {pr.percent}%
                        </span>
                        <ProgressBar percent={pr.percent} color={tone.accent} thin />
                      </button>
                      {openPhaseId === p.id && <PhaseModal phaseId={p.id} inline onClose={() => setOpenPhaseId(null)} />}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {inProgress.length > 0 && (
          <Panel title="In progress" count={inProgress.length}>
            <div className="divide-y divide-stone-200">{inProgress.map(row)}</div>
          </Panel>
        )}

      </div>

      <CertificationForm open={!!editingCert} cert={editingCert === 'new' ? null : editingCert} onClose={() => setEditingCert(null)} />
      <TaskForm open={!!editing} task={editing === 'new' ? null : editing} defaults={{ dueDate: today }} onClose={() => setEditing(null)} />
    </div>
  );
}
