import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, BookOpen, CalendarClock, Check, Clock, Copy, ExternalLink, Flame, GraduationCap, ListPlus, Pencil, Plus, RefreshCw, Settings, TriangleAlert,
} from 'lucide-react';
import { apiOrigin, learningApi } from '../../api';
import { currentPhase, useStore } from '../../store';
import { PRIORITIES, TONES, phaseTone } from '../../theme';
import { formatDate, todayStr } from '../../dates';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Modal, ProgressBar, SectionTitle, cx, inputClass } from '../../ui';
import { FormModal } from '../../forms';
import { bookmarkletUrl } from './courseraSync';
import NotesSection from './NotesSection';
import { buildPlan, courseStats, itemMinutes, minutesByDate, shiftDate, streak } from './plan';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

// Career tab "Learning": Coursera courses, linked to roadmap phases, planned into a daily objective.
export default function LearningView() {
  const { state, actions } = useStore();
  const { phases, tasks, categories } = state;
  const [data, setData] = useState(null); // { settings, courses }
  const [failed, setFailed] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(null); // course | 'new' | null

  const load = useCallback(async () => {
    const result = await actions.run(() => learningApi.load());
    if (result) setData(result);
    setFailed(!result);
  }, [actions]);
  useEffect(() => {
    load();
  }, [load]);

  const replaceCourse = (course) => course && setData((d) => ({ ...d, courses: d.courses.map((c) => (c.id === course.id ? course : c)) }));

  const now = currentPhase(phases, tasks);
  const plan = useMemo(
    () => data && buildPlan({ courses: data.courses, settings: data.settings, phases, currentPhaseId: now?.id }),
    [data, phases, now?.id],
  );

  if (!data) {
    return failed ? (
      <div className="text-center py-10">
        <Button variant="soft" icon={RefreshCw} onClick={load}>Retry</Button>
      </div>
    ) : (
      <p className="text-sm text-stone-500 py-10 text-center">Loading your learning plan…</p>
    );
  }

  const today = todayStr();
  const toggleItem = async (course, item) => {
    replaceCourse(await actions.run(() => learningApi.setItemDone(course.id, item.key, !item.done, today)));
  };
  const saveCourse = async (id, patch) => {
    const course = await actions.run(() => learningApi.updateCourse(id, patch));
    replaceCourse(course);
    return !!course;
  };

  // Today's objectives become one Career task per course, due today and linked to its phase/topic.
  const addToTasks = async () => {
    const careerCategory = categories.find((c) => c.name === 'Career')?.id || null;
    for (const p of plan.plan) {
      await actions.createTask({
        title: `Coursera: ${p.course.name} (${hm(p.minutes)})`,
        notes: p.items.map((it) => `• ${it.moduleName}: ${it.name} (${itemMinutes(it)}m)`).join('\n'),
        dueDate: today,
        priority: 'high',
        categoryId: careerCategory,
        phaseId: p.course.phaseId || null,
        topicId: p.course.topicId || null,
      });
    }
  };

  const active = data.courses.filter((c) => !c.archived);
  const archived = data.courses.filter((c) => c.archived);

  return (
    <>
      <TodayCard
        plan={plan}
        courses={data.courses}
        settings={data.settings}
        onToggle={toggleItem}
        onAddTasks={addToTasks}
        onSync={() => setSyncOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <SectionTitle
        icon={GraduationCap}
        iconClass="text-zone-green"
        subtitle={
          data.settings.lastSyncAt
            ? `Last synced from Coursera ${new Date(data.settings.lastSyncAt).toLocaleString()}`
            : 'Sync from Coursera, or add a course by hand.'
        }
        action={<Button variant="soft" icon={Plus} onClick={() => setEditing('new')}>Add course</Button>}
      >
        Courses
      </SectionTitle>
      {active.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          text="Use “Sync from Coursera” above to bring in your enrolled courses, then link each one to a roadmap phase."
        />
      )}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {active.map((c) => (
          <CourseCard key={c.id} course={c} projection={plan.projections[c.id]} onEdit={() => setEditing(c)} onSave={saveCourse} />
        ))}
      </div>
      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold text-stone-500">{archived.length} archived course{archived.length === 1 ? '' : 's'}</summary>
          <div className="grid lg:grid-cols-2 gap-5 mt-3 items-start">
            {archived.map((c) => (
              <CourseCard key={c.id} course={c} onEdit={() => setEditing(c)} onSave={saveCourse} />
            ))}
          </div>
        </details>
      )}

      <NotesSection courses={data.courses} />

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} onImported={load} />
      <SettingsModal
        open={settingsOpen}
        settings={data.settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={(settings) => setData((d) => ({ ...d, settings }))}
      />
      <CourseForm
        open={!!editing}
        course={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </>
  );
}

/* ---------- Today ---------- */

function TodayCard({ plan, courses, settings, onToggle, onAddTasks, onSync, onSettings }) {
  const { state } = useStore();
  const byDate = minutesByDate(courses);
  const days = settings.studyDays?.length ? settings.studyDays : [0, 1, 2, 3, 4, 5, 6];
  const streakDays = streak(byDate, days, plan.today);
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(plan.today, i - 6));
  const percent = Math.min(100, Math.round((plan.doneToday / plan.daily) * 100));
  const goalMet = plan.doneToday >= plan.daily;

  // Items already finished today, so ticking one off keeps it in view instead of being replaced.
  const doneToday = courses.flatMap((c) =>
    c.modules.flatMap((m) => m.items.filter((it) => it.done && it.doneOn === plan.today).map((it) => ({ course: c, item: { ...it, moduleName: m.name } }))),
  );
  const phaseOf = (c) => state.phases.find((p) => p.id === c.phaseId);

  return (
    <Card block className="career-rise overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-start gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
            <CalendarClock className="w-3.5 h-3.5 text-ink" /> Today's learning objective · {formatDate(plan.today)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-ink mt-1.5">
            {goalMet ? (
              <span className="hl">Goal met. Nice work!</span>
            ) : (
              <>
                <span className="hl">{hm(plan.daily - plan.doneToday)}</span> to go today
              </>
            )}
          </h1>
          <div className="flex items-center justify-between mt-4 mb-1.5 text-xs font-semibold text-stone-700">
            <span>{hm(plan.doneToday)} of {hm(plan.daily)}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <ProgressBar percent={percent} />
        </div>
        <div className="flex md:flex-col gap-3 shrink-0">
          <div className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-stone-300">
            <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              <Flame className="w-3 h-3 text-orange-500" /> Streak
            </div>
            <div className="text-2xl font-extrabold font-display text-ink tabular-nums">
              {streakDays} <span className="text-xs font-semibold text-stone-500">day{streakDays === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-stone-300" title="Minutes learned, last 7 days">
            <div className="font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Last 7 days</div>
            <div className="flex items-end gap-1 h-10 mt-1">
              {week.map((d) => {
                const m = byDate[d] || 0;
                return (
                  <span key={d} className="flex-1 flex flex-col items-center gap-0.5" title={`${formatDate(d)}: ${hm(m)}`}>
                    <span
                      className={cx('w-full rounded-sm', m >= plan.daily ? 'bg-zone-green' : m ? 'bg-emerald-200' : 'bg-stone-100')}
                      style={{ height: `${Math.max(3, Math.min(28, (m / plan.daily) * 28))}px` }}
                    />
                    <span className="text-[9px] font-mono text-stone-400">{DAYS[new Date(`${d}T00:00`).getDay()][0]}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
        {plan.overloaded > 0 && (
          <div className="flex gap-2.5 p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Your target dates need about <b>{hm(plan.overloaded)}/day</b>, more than your {hm(plan.daily)} budget. Move a target date
              or raise your daily time.
            </span>
          </div>
        )}

        {doneToday.length > 0 && (
          <div className="space-y-1.5">
            {doneToday.map(({ course, item }) => (
              <ItemRow key={`${course.id}-${item.key}`} item={item} courseName={course.name} onToggle={() => onToggle(course, item)} />
            ))}
          </div>
        )}

        {plan.plan.map((p) => {
          const phase = phaseOf(p.course);
          return (
            <div key={p.course.id}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm font-bold text-ink">{p.course.name}</span>
                {phase && <Badge tone={phaseTone(phase)}>Phase {phase.order}</Badge>}
                <span className="ml-auto font-mono text-[11px] text-stone-500">~{hm(p.minutes)}</span>
              </div>
              <div className="space-y-1.5">
                {p.items.map((it) => (
                  <ItemRow key={it.key} item={it} onToggle={() => onToggle(p.course, it)} />
                ))}
              </div>
            </div>
          );
        })}

        {plan.plan.length === 0 && !goalMet && (
          <p className="text-sm text-stone-500">
            {!plan.isStudyDay
              ? `Rest day. Next study day: ${plan.nextStudyDate ? formatDate(plan.nextStudyDate) : 'none set'}.`
              : courses.some((c) => !c.archived)
                ? 'Everything is done. Add your next course to keep going.'
                : 'Sync your Coursera courses to get a daily plan.'}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="taxi" icon={RefreshCw} onClick={onSync}>Sync from Coursera</Button>
          {plan.plan.length > 0 && (
            <Button variant="soft" icon={ListPlus} onClick={onAddTasks}>Add today to Tasks</Button>
          )}
          <Button variant="ghost" icon={Settings} onClick={onSettings}>
            {hm(plan.daily)}/day · {days.length === 7 ? 'every day' : days.map((d) => DAYS[d]).join(' ')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ItemRow({ item, courseName, onToggle }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      className={cx(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition',
        item.done ? 'bg-emerald-50 border-emerald-200' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50',
      )}
    >
      <span className={cx('inline-flex', item.done && 'career-pop')}>
        <Checkbox round checked={item.done} label={item.name} onChange={onToggle} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={cx('block text-sm font-medium truncate', item.done ? 'text-emerald-800 line-through decoration-emerald-400' : 'text-stone-800')}>
          {item.name}
        </span>
        <span className="block text-[11px] text-stone-500 truncate">
          {[courseName, item.moduleName, item.type].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-1 font-mono text-[11px] text-stone-500">
        <Clock className="w-3 h-3" />
        {itemMinutes(item)}m
      </span>
    </div>
  );
}

/* ---------- Courses ---------- */

function CourseCard({ course: c, projection, onEdit, onSave }) {
  const { state, actions } = useStore();
  const st = courseStats(c);
  const phase = state.phases.find((p) => p.id === c.phaseId);
  const topic = phase?.topics.find((t) => t.id === c.topicId);
  const tone = phase ? phaseTone(phase) : TONES.stone;
  const hasCert = state.certifications.some((x) => x.name === c.name);

  return (
    <Card className="p-5 career-lift">
      <div className="flex items-start gap-3">
        {c.photoUrl ? (
          <img src={c.photoUrl} alt="" className="w-12 h-12 rounded-xl border border-stone-200 object-cover shrink-0" />
        ) : (
          <span className="w-12 h-12 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-stone-500" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-ink leading-snug">{c.name}</div>
          <div className="text-xs text-stone-500 truncate">
            {[c.partner, c.source === 'manual' && 'Added by hand'].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex shrink-0">
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener noreferrer" title="Open on Coursera" className="p-1.5 rounded-lg text-stone-500 hover:text-ink hover:bg-stone-100">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button type="button" onClick={onEdit} title="Edit course" aria-label="Edit course" className="p-1.5 rounded-lg text-stone-500 hover:text-ink hover:bg-stone-100">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 mb-1.5 text-xs font-semibold text-stone-700">
        <span>
          {st.doneCount} / {st.count} items · {hm(st.remainingMinutes)} left
        </span>
        <span className="tabular-nums">{st.percent}%</span>
      </div>
      <ProgressBar percent={st.percent} color={phase ? tone.accent : undefined} thin />

      <div className="flex flex-wrap gap-1.5 mt-3">
        {phase ? (
          <Badge tone={tone}>
            Phase {phase.order}: {phase.title}
            {topic ? ` › ${topic.title}` : ''}
          </Badge>
        ) : (
          <button type="button" onClick={onEdit}>
            <Badge tone={TONES.amber}>Link to a roadmap phase</Badge>
          </button>
        )}
        {c.priority !== 'medium' && <Badge tone={PRIORITIES.find((p) => p.key === c.priority).tone}>{c.priority} priority</Badge>}
      </div>

      {!st.complete && st.next && (
        <div className="mt-3 text-xs text-stone-600">
          <span className="font-semibold text-stone-800">Next:</span> {st.next.moduleName}: {st.next.name}
        </div>
      )}

      {!st.complete && projection && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span>
            Projected finish: <b className="text-stone-800">{projection.finishDate ? formatDate(projection.finishDate) : 'not scheduled'}</b>
          </span>
          {c.targetDate && (
            <Badge pill tone={projection.onTrack ? TONES.emerald : TONES.rose}>
              {projection.onTrack ? 'On track' : 'Behind'} for {formatDate(c.targetDate)}
            </Badge>
          )}
        </div>
      )}

      {st.complete && (
        <div className="mt-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
            <Check className="w-4 h-4" /> Course complete
          </div>
          <div className="flex flex-wrap gap-2">
            {topic && !topic.done && (
              <Button variant="soft" icon={Check} onClick={() => actions.updateTopic(phase.id, topic.id, { done: true })}>
                Mark “{topic.title}” mastered
              </Button>
            )}
            {!hasCert && (
              <Button
                variant="soft"
                icon={Award}
                onClick={() => actions.createCertification({ code: 'Coursera', name: c.name, status: 'passed', optional: true })}
              >
                Add to certifications
              </Button>
            )}
            {!c.archived && (
              <Button variant="ghost" onClick={() => onSave(c.id, { archived: true })}>Archive</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function CourseForm({ open, course, onClose, onSaved }) {
  const { state, actions } = useStore();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm({
      name: course?.name || '', url: course?.url || '', phaseId: course?.phaseId || '', topicId: course?.topicId || '',
      targetDate: course?.targetDate || '', priority: course?.priority || 'medium', archived: !!course?.archived,
      moduleCount: 4, totalHours: 10,
    });
    setError('');
  }, [open, course]);

  const phase = state.phases.find((p) => p.id === form.phaseId);
  const save = async () => {
    if (!form.name?.trim()) return setError('Give the course a name'), false;
    const data = {
      name: form.name.trim(), phaseId: form.phaseId || null, topicId: form.topicId || null,
      targetDate: form.targetDate || null, priority: form.priority, archived: form.archived,
    };
    const ok = await actions.run(() =>
      course
        ? learningApi.updateCourse(course.id, data)
        : learningApi.createCourse({ ...data, url: form.url.trim(), moduleCount: form.moduleCount, totalHours: form.totalHours }),
    );
    if (ok) onSaved();
    return !!ok;
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${course.name}"? A later Coursera sync would bring it back while you are enrolled.`)) return;
    if (await actions.run(() => learningApi.deleteCourse(course.id).then(() => true))) {
      onSaved();
      onClose();
    }
  };

  return (
    <FormModal
      open={open}
      title={course ? 'Edit course' : 'Add a course'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete"
      onDelete={course && remove}
    >
      <Field label="Course name">
        <input
          autoFocus={!course}
          className={inputClass}
          value={form.name || ''}
          disabled={course?.source === 'coursera'}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Google Cloud Architecture"
        />
      </Field>
      {!course && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Modules">
            <input type="number" min={1} max={50} className={inputClass} value={form.moduleCount} onChange={(e) => set({ moduleCount: e.target.value })} />
          </Field>
          <Field label="Total hours">
            <input type="number" min={1} max={500} className={inputClass} value={form.totalHours} onChange={(e) => set({ totalHours: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Roadmap phase">
          <select className={inputClass} value={form.phaseId || ''} onChange={(e) => set({ phaseId: e.target.value, topicId: '' })}>
            <option value="">Not linked</option>
            {state.phases.map((p) => <option key={p.id} value={p.id}>Phase {p.order}: {p.title}</option>)}
          </select>
        </Field>
        <Field label="Topic">
          <select className={inputClass} value={form.topicId || ''} disabled={!phase} onChange={(e) => set({ topicId: e.target.value })}>
            <option value="">Whole phase</option>
            {phase?.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Finish by (optional)">
          <input type="date" className={inputClass} value={form.targetDate || ''} onChange={(e) => set({ targetDate: e.target.value })} />
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      {course && (
        <label className="flex items-center gap-3 text-sm font-medium text-stone-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.archived} onChange={(e) => set({ archived: e.target.checked })} />
          Archived (left out of the daily plan)
        </label>
      )}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Settings & sync ---------- */

function SettingsModal({ open, settings, onClose, onSaved }) {
  const { actions } = useStore();
  const [form, setForm] = useState(settings);
  useEffect(() => {
    if (open) setForm(settings);
  }, [open, settings]);
  const toggleDay = (d) =>
    setForm((f) => ({ ...f, studyDays: f.studyDays.includes(d) ? f.studyDays.filter((x) => x !== d) : [...f.studyDays, d] }));

  const save = async () => {
    if (!form.studyDays.length) return false;
    const saved = await actions.run(() => learningApi.saveSettings({ dailyMinutes: Number(form.dailyMinutes), studyDays: form.studyDays }));
    if (saved) onSaved(saved);
    return !!saved;
  };

  return (
    <FormModal open={open} title="Daily learning time" onClose={onClose} onSubmit={save}>
      <Field label="Minutes per study day">
        <input type="number" min={10} max={600} step={5} className={inputClass} value={form.dailyMinutes} onChange={(e) => setForm((f) => ({ ...f, dailyMinutes: e.target.value }))} />
      </Field>
      <div>
        <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Study days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((label, d) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleDay(d)}
              aria-pressed={form.studyDays.includes(d)}
              className={cx(
                'px-3 py-1.5 rounded-[10px] border-[1.5px] text-xs font-semibold transition',
                form.studyDays.includes(d) ? 'bg-taxi border-ink text-ink' : 'border-stone-300 text-stone-600 hover:border-stone-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {!form.studyDays.length && <p className="text-xs font-medium text-rose-600 mt-2">Pick at least one day.</p>}
      </div>
    </FormModal>
  );
}

function SyncModal({ open, onClose, onImported }) {
  const { actions } = useStore();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState('');
  const [message, setMessage] = useState('');
  const linkRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setJson('');
    setMessage('');
    (async () => {
      const res = await actions.run(() => learningApi.syncToken());
      if (!res) return;
      const appUrl = `${window.location.origin}${window.location.pathname}#/career`;
      setUrl(bookmarkletUrl({ endpoint: `${apiOrigin()}/api/learning/sync`, token: res.token, appUrl }));
    })();
  }, [open, actions]);

  // React blocks javascript: hrefs, so the draggable link gets its URL directly.
  useEffect(() => {
    if (url && linkRef.current) linkRef.current.setAttribute('href', url);
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setMessage('Copy was blocked by the browser. Drag the button to your bookmarks bar instead.');
    }
  };

  const importJson = async () => {
    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      return setMessage('That is not valid JSON. Copy the whole text from the Coursera page.');
    }
    const res = await actions.run(() => learningApi.importSync(payload));
    if (res) {
      setMessage(`Imported: ${res.created} new, ${res.updated} updated, ${res.newlyDone} items newly done.`);
      setJson('');
      onImported();
    }
  };

  return (
    <Modal open={open} title="Sync from Coursera" onClose={onClose} wide footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <p className="text-sm text-stone-600">
        Coursera has no API for personal accounts, so a bookmark reads your courses from coursera.org with your own login and sends
        them here. Your Coursera password never touches this app.
      </p>
      <ol className="space-y-3 text-sm text-stone-700 list-decimal pl-5">
        <li>
          <b>One time:</b> drag this button to your bookmarks bar, or copy it and paste it as a new bookmark's URL.
          <div className="flex flex-wrap gap-2 mt-2">
            <a
              ref={linkRef}
              onClick={(e) => e.preventDefault()}
              className={cx(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] border-[1.5px] border-ink bg-taxi text-ink text-xs font-semibold shadow-key cursor-grab',
                !url && 'opacity-50 pointer-events-none',
              )}
            >
              <GraduationCap className="w-4 h-4" /> Sync Coursera → Task Assistant
            </a>
            <Button variant="soft" icon={copied ? Check : Copy} disabled={!url} onClick={copy}>
              {copied ? 'Copied' : 'Copy bookmark URL'}
            </Button>
          </div>
          <p className="text-[11px] text-stone-500 mt-1.5">The bookmark holds a private sync key for your account (valid 180 days). Don't share it.</p>
        </li>
        <li>
          Open{' '}
          <a href="https://www.coursera.org/my-learning" target="_blank" rel="noopener noreferrer" className="font-semibold text-zone-blue underline">
            coursera.org/my-learning
          </a>{' '}
          while signed in, and click the bookmark.
        </li>
        <li>Come back here. The plan updates with your courses and progress. Sync again any time you've studied on Coursera.</li>
      </ol>

      <details className="pt-2 border-t-[1.5px] border-stone-200">
        <summary className="cursor-pointer text-xs font-semibold text-stone-600 pt-3">Import: if the bookmark showed text to copy instead</summary>
        <textarea
          className={cx(inputClass, 'mt-3 h-28 font-mono text-[11px]')}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"today":"…","courses":[…]}'
        />
        <Button variant="soft" className="mt-2" disabled={!json.trim()} onClick={importJson}>Import</Button>
      </details>
      {message && <p className="text-xs font-medium text-stone-700">{message}</p>}
    </Modal>
  );
}
