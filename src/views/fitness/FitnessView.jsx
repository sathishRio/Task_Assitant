import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, CalendarCheck, Download, Dumbbell, Flag, Layers, Plus, Salad, Trash2, Upload } from 'lucide-react';
import { fitnessApi } from '../../api';
import { todayStr } from '../../dates';
import { Button, Card, cx, Field, IconButton, inputClass, MetricCard, PageHero, ProgressBar, selectClass } from '../../ui';

// Fitness (web): the central plan editor — weekly schedule with diet, workout library, phases and
// goal — plus the weekly and monthly check-ins. Daily tracking happens in the Hub app.
// Saving the plan makes a version effective from today: upcoming days follow it, past days keep
// the plan they were done with (see server/src/fitness.js).

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_TYPES = { training: 'Training', rest: 'Rest', active_recovery: 'Active recovery' };
const TABS = [
  { key: 'schedule', label: 'Schedule & diet', Icon: Salad },
  { key: 'workouts', label: 'Workouts', Icon: Dumbbell },
  { key: 'phases', label: 'Phases', Icon: Layers },
  { key: 'goal', label: 'Goal', Icon: Flag },
  { key: 'checkins', label: 'Check-ins', Icon: CalendarCheck },
];
const nice = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const label = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const small = 'px-2.5 py-1.5 bg-white border-[1.5px] border-stone-300 rounded-[8px] text-ink text-sm focus:outline-none focus:border-ink';
const Chip = ({ on, children, ...p }) => (
  <button type="button" aria-pressed={on} {...p} className={cx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[1.5px] text-xs font-semibold transition', on ? 'bg-taxi-soft border-ink text-ink' : 'bg-white border-stone-300 text-stone-700 hover:border-ink')}>{children}</button>
);

export default function FitnessView() {
  const [plan, setPlan] = useState(undefined);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('schedule');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    fitnessApi.plan(todayStr()).then((r) => { setPlan(r.plan); setDraft(r.plan && structuredClone(r.plan)); }).catch((e) => setError(e.message));
  }, []);

  const edit = useCallback((fn) => setDraft((cur) => { const n = structuredClone(cur); fn(n); return n; }), []);
  const dirty = plan && JSON.stringify(plan) !== JSON.stringify(draft);

  const save = async (p, note) => {
    setSaving(true);
    setError('');
    try {
      const r = await fitnessApi.savePlan(p, todayStr());
      setPlan(r.plan);
      setDraft(structuredClone(r.plan));
      setMsg(note || 'Saved. Today and upcoming days now follow this plan; past days keep their old plan.');
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let json;
    try { json = JSON.parse(await file.text()); } catch { return setError('That file is not valid JSON.'); }
    if (plan && !window.confirm('Replace your plan with this file? Past days keep the plan they were done with.')) return;
    save(json, 'Plan imported.');
  };
  const exportPlan = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'fitness_plan.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHero
        icon={Dumbbell}
        eyebrow="Fitness · central plan"
        title={plan?.meta?.planName || 'Your fitness plan'}
        description="Workouts, diet and targets in one place. Edits apply from today onward, and the Hub app's daily tracker follows them. Past days keep the plan they were done with."
        actions={(
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
            <Button variant="soft" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
            {plan && <Button variant="soft" icon={Download} onClick={exportPlan}>Export</Button>}
          </>
        )}
      />
      {error && <p role="alert" className="px-3 py-2 rounded-[10px] border-[1.5px] border-rose-300 bg-rose-50 text-rose-700 text-sm">{error}</p>}

      {plan === undefined ? <p className="text-stone-500">Loading…</p> : !plan ? (
        <Card block className="p-6 space-y-3">
          <h2 className="text-xl font-bold text-ink">Load your plan</h2>
          <p className="text-sm text-stone-500">Import your plan file (like <code>fitness_plan.json</code>). It becomes your central plan: workouts, diet, phases and weekly weight targets.</p>
          <Button variant="taxi" icon={Upload} onClick={() => fileRef.current?.click()}>Import plan file</Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map(({ key, label: l, Icon }) => <Chip key={key} on={tab === key} onClick={() => setTab(key)}><Icon className="w-3.5 h-3.5" />{l}</Chip>)}
          </div>
          {tab === 'schedule' && <ScheduleEditor p={draft} edit={edit} />}
          {tab === 'workouts' && <WorkoutsEditor p={draft} edit={edit} />}
          {tab === 'phases' && <PhasesEditor p={draft} edit={edit} />}
          {tab === 'goal' && <GoalEditor p={draft} edit={edit} />}
          {tab === 'checkins' && <CheckIns />}

          {tab !== 'checkins' && (
            <div className="sticky bottom-4 z-30">
              <Card block className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-stone-500">{dirty ? 'Unsaved changes · applies from today' : msg || 'Edits apply from today onward.'}</span>
                <div className="flex gap-2">
                  {dirty && <Button variant="ghost" onClick={() => setDraft(structuredClone(plan))}>Discard</Button>}
                  <Button disabled={!dirty || saving} onClick={() => save(draft)}>{saving ? 'Saving…' : 'Save plan'}</Button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Schedule & diet ---------- */

function ScheduleEditor({ p, edit }) {
  const [i, setI] = useState((new Date().getDay() + 6) % 7);
  const d = p.weeklySchedule[i];
  const set = (fn) => edit((n) => fn(n.weeklySchedule[i]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SHORT.map((s, k) => {
          const w = p.weeklySchedule[k];
          return <Chip key={s} on={i === k} onClick={() => setI(k)}>{s} · {w.workoutId ? p.workouts[w.workoutId]?.name.split(' - ')[0] : DAY_TYPES[w.dayType]}{w.isVegDay ? ' · veg' : ''}</Chip>;
        })}
      </div>
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4 items-start">
        <Card className="p-5 space-y-4">
          <h3 className="text-lg font-bold text-ink">{label(WEEKDAYS[i])}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day type">
              <select className={cx(selectClass, 'w-full')} value={d.dayType} onChange={(e) => set((x) => { x.dayType = e.target.value; if (e.target.value !== 'training') x.workoutId = null; })}>
                {Object.entries(DAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Workout">
              <select className={cx(selectClass, 'w-full')} value={d.workoutId || ''} onChange={(e) => set((x) => { x.workoutId = e.target.value || null; if (x.workoutId) x.dayType = 'training'; })}>
                <option value="">None</option>
                {Object.entries(p.workouts).map(([id, w]) => <option key={id} value={id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.isVegDay} onChange={(e) => set((x) => { x.isVegDay = e.target.checked; })} /> Veg day</label>
          <Field label="Recovery (one per line)">
            <textarea rows={4} className={inputClass} value={(d.recovery?.items || []).join('\n')} onChange={(e) => set((x) => { x.recovery = { ...(x.recovery || {}), items: e.target.value.split('\n') }; })} />
          </Field>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-ink">Diet · {label(WEEKDAYS[i])}</h3>
            <select className={selectClass} aria-label="Copy meals from another day" value="" onChange={(e) => e.target.value !== '' && edit((n) => { n.weeklySchedule[i].meals = structuredClone(n.weeklySchedule[Number(e.target.value)].meals); })}>
              <option value="">Copy meals from…</option>
              {SHORT.map((s, k) => k !== i && <option key={s} value={k}>{s}</option>)}
            </select>
          </div>
          {d.meals.map((m, k) => (
            <div key={k} className="grid grid-cols-[110px_1fr_auto] gap-2 pb-3 border-b border-stone-200 last:border-0">
              <input type="time" aria-label="Time" className={small} value={m.time} onChange={(e) => set((x) => { x.meals[k].time = e.target.value; })} />
              <input type="text" aria-label="Meal slot" placeholder="Slot, e.g. lunch" className={small} value={m.slot} onChange={(e) => set((x) => { x.meals[k].slot = e.target.value; })} />
              <IconButton icon={Trash2} label="Remove meal" onClick={() => set((x) => { x.meals.splice(k, 1); })} />
              <textarea rows={2} aria-label="What to eat" className={cx(small, 'col-span-3')} value={m.items} onChange={(e) => set((x) => { x.meals[k].items = e.target.value; })} />
              <label className="col-span-3 flex items-center gap-2 text-xs text-stone-500"><input type="checkbox" checked={Boolean(m.isTreatMeal)} onChange={(e) => set((x) => { x.meals[k].isTreatMeal = e.target.checked; })} /> Treat meal</label>
            </div>
          ))}
          <Button variant="ghost" icon={Plus} onClick={() => set((x) => { x.meals.push({ slot: '', time: '', cuisine: '', items: '' }); })}>Meal</Button>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Workouts ---------- */

function WorkoutsEditor({ p, edit }) {
  const ids = Object.keys(p.workouts);
  const [id, setId] = useState(ids[0] || '');
  const w = p.workouts[id];
  const set = (fn) => edit((n) => fn(n.workouts[id]));
  const usedOn = SHORT.filter((_, k) => p.weeklySchedule[k].workoutId === id);
  const add = () => {
    const name = window.prompt('New workout name, e.g. Full Body C');
    if (!name?.trim()) return;
    let key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'workout';
    while (p.workouts[key]) key += '_2';
    edit((n) => { n.workouts[key] = { name: name.trim(), focus: [], finisher: '', exercises: [] }; });
    setId(key);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ids.map((k) => <Chip key={k} on={id === k} onClick={() => setId(k)}>{p.workouts[k].name}</Chip>)}
        <Chip onClick={add}><Plus className="w-3.5 h-3.5" /> New workout</Chip>
      </div>
      {w && (
        <Card className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><input className={inputClass} maxLength={80} value={w.name} onChange={(e) => set((x) => { x.name = e.target.value; })} /></Field>
            <Field label="Focus (comma separated)"><input className={inputClass} value={(w.focus || []).join(', ')} onChange={(e) => set((x) => { x.focus = e.target.value.split(',').map((s) => s.trim()); })} /></Field>
          </div>
          <p className="text-xs text-stone-500">{usedOn.length ? `Used on ${usedOn.join(', ')}.` : 'Not on the weekly schedule yet.'} Changes apply to every upcoming session of this workout.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left font-mono text-[11px] uppercase text-stone-500"><th className="py-2 pr-2">Exercise</th><th className="pr-2 w-20">Sets</th><th className="pr-2 w-28">Reps</th><th className="pr-2 w-32">Type</th><th className="w-20" /></tr></thead>
              <tbody>
                {w.exercises.map((x, k) => (
                  <tr key={k} className="border-t border-stone-200">
                    <td className="py-1.5 pr-2"><input className={cx(small, 'w-full min-w-48')} aria-label="Exercise" value={x.name} onChange={(e) => set((wo) => { wo.exercises[k].name = e.target.value; })} /></td>
                    <td className="pr-2"><input type="number" min={1} max={20} className={cx(small, 'w-full')} aria-label="Sets" value={x.sets} onChange={(e) => set((wo) => { wo.exercises[k].sets = Number(e.target.value); })} /></td>
                    <td className="pr-2"><input className={cx(small, 'w-full')} aria-label="Reps" value={x.reps} onChange={(e) => set((wo) => { wo.exercises[k].reps = e.target.value; })} /></td>
                    <td className="pr-2">
                      <select className={cx(selectClass, 'w-full')} aria-label="Type" value={x.type} onChange={(e) => set((wo) => { wo.exercises[k].type = e.target.value; })}>
                        <option value="compound">compound</option><option value="accessory">accessory</option><option value="core">core</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap">
                      <IconButton icon={ArrowUp} label="Move up" disabled={!k} onClick={() => set((wo) => { [wo.exercises[k - 1], wo.exercises[k]] = [wo.exercises[k], wo.exercises[k - 1]]; })} />
                      <IconButton icon={Trash2} label="Remove exercise" onClick={() => set((wo) => { wo.exercises.splice(k, 1); })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" icon={Plus} onClick={() => set((x) => { x.exercises.push({ name: '', sets: 3, reps: '10', type: 'accessory' }); })}>Exercise</Button>
          <Field label="Finisher"><input className={inputClass} maxLength={200} value={w.finisher || ''} onChange={(e) => set((x) => { x.finisher = e.target.value; })} /></Field>
          {!usedOn.length && <Button variant="danger" onClick={() => { edit((n) => { delete n.workouts[id]; }); setId(ids.find((k) => k !== id) || ''); }}>Delete workout</Button>}
        </Card>
      )}
    </div>
  );
}

/* ---------- Phases ---------- */

const PHASE_FIELDS = [
  ['calories', 'kcal', { step: 50 }], ['proteinG', 'Protein g'], ['fatG', 'Fat g'], ['carbsG', 'Carbs g'],
  ['waterL', 'Water L', { step: 0.1 }], ['stepsPerDay', 'Steps', { step: 500 }], ['setsFactor', 'Sets ×', { step: 0.25, min: 0.25, max: 2 }], ['extraSetsFirst', '+1 set on first', { min: 0, max: 10 }],
];

function PhasesEditor({ p, edit }) {
  const setPh = (id, fn) => edit((n) => fn(n.phases.find((x) => x.id === id)));
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">Daily targets and training rules for each part of the plan. They apply to every day in that phase. “Sets ×” scales every exercise (0.5 = deload); “+1 set on first” adds a set to that many opening exercises.</p>
      {p.phases.map((ph) => (
        <Card key={ph.id} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink">{ph.name}</h3>
            <span className="font-mono text-[11px] uppercase text-stone-500">Weeks {ph.weeks[0]}–{ph.weeks[1]}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PHASE_FIELDS.map(([key, l, props = {}]) => (
              <Field key={key} label={l}><input type="number" className={inputClass} {...props} value={ph[key] ?? ''} onChange={(e) => setPh(ph.id, (x) => { x[key] = numOrNull(e.target.value); })} /></Field>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Training"><textarea rows={2} className={inputClass} value={ph.training || ''} onChange={(e) => setPh(ph.id, (x) => { x.training = e.target.value; })} /></Field>
            <Field label="Cardio"><textarea rows={2} className={inputClass} value={ph.cardio || ''} onChange={(e) => setPh(ph.id, (x) => { x.cardio = e.target.value; })} /></Field>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Goal ---------- */

function GoalEditor({ p, edit }) {
  const u = (key) => (e) => edit((n) => { n.user[key] = numOrNull(e.target.value); });
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card className="p-5 space-y-4">
        <Field label="Plan name"><input className={inputClass} maxLength={120} value={p.meta.planName} onChange={(e) => edit((n) => { n.meta.planName = e.target.value; })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><input type="date" className={inputClass} value={p.meta.startDate} onChange={(e) => e.target.value && edit((n) => { n.meta.startDate = e.target.value; })} /></Field>
          <Field label="Weeks"><input type="number" min={1} max={260} className={inputClass} value={p.meta.durationWeeks} onChange={(e) => edit((n) => { n.meta.durationWeeks = Number(e.target.value) || 1; })} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start kg"><input type="number" step="0.1" className={inputClass} value={p.user.startWeightKg ?? ''} onChange={u('startWeightKg')} /></Field>
          <Field label="Target kg"><input type="number" step="0.1" className={inputClass} value={p.user.targetWeightKg ?? ''} onChange={u('targetWeightKg')} /></Field>
          <Field label="Height cm"><input type="number" className={inputClass} value={p.user.heightCm ?? ''} onChange={u('heightCm')} /></Field>
        </div>
        <div>
          <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Weigh-in days</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, k) => {
              const on = p.tracking.weighInDays.includes(d);
              return <Chip key={d} on={on} onClick={() => edit((n) => { n.tracking.weighInDays = on ? n.tracking.weighInDays.filter((x) => x !== d) : [...n.tracking.weighInDays, d]; })}>{SHORT[k]}</Chip>;
            })}
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-lg font-bold text-ink mb-3">Weekly weight targets</h3>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {p.tracking.weekly.map((w, k) => (
            <label key={w.week} className="flex items-center justify-between gap-2 text-sm">
              <span>Week {w.week} <span className="text-stone-400">· {nice(w.weekEnding)}</span></span>
              <input type="number" step="0.1" className={cx(small, 'w-24')} aria-label={`Week ${w.week} target kg`} value={w.targetKg ?? ''} onChange={(e) => edit((n) => { n.tracking.weekly[k].targetKg = numOrNull(e.target.value); })} />
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Check-ins (weekly + monthly) ---------- */

const STATUS = {
  on_track: ['On track', 'bg-emerald-50 text-emerald-700 border-emerald-300'],
  behind: ['Behind', 'bg-orange-50 text-orange-700 border-orange-300'],
  missed: ['No weigh-in', 'bg-stone-100 text-stone-500 border-stone-300'],
  upcoming: ['Upcoming', 'bg-white text-stone-400 border-stone-200'],
};

function CheckIns() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { fitnessApi.progress(todayStr()).then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="text-rose-700 text-sm">{error}</p>;
  if (!d) return <p className="text-stone-500">Loading…</p>;
  const kg = (n) => (n == null ? '—' : `${n} kg`);
  const today = todayStr();
  const th = 'text-left font-mono text-[11px] uppercase text-stone-500 px-4 py-2.5 border-b-[1.5px] border-stone-300';
  const td = 'px-4 py-2 border-b border-stone-200 whitespace-nowrap tabular-nums';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Week avg" value={kg(d.latestAvg)} note={`Week ${d.week} of ${d.durationWeeks}${d.phase ? ` · ${d.phase}` : ''}`} />
        <MetricCard label="Lost" value={d.lost == null ? '—' : `${d.lost} kg`} note={`${kg(d.start)} → ${kg(d.goal)}`} />
        <MetricCard label="To go" value={kg(d.toGo)} note={d.percent != null ? `${d.percent}% of the goal` : ''} />
        <MetricCard label="Streak" value={`${d.streak} d`} note={`${d.sessionsThisWeek.done}/${d.sessionsThisWeek.planned} sessions this week`} />
      </div>
      {d.percent != null && <ProgressBar percent={d.percent} color="#3bb57c" />}

      <Card className="p-5">
        <h3 className="text-lg font-bold text-ink mb-3">Weight vs target</h3>
        <WeightChart weights={d.weights} weeks={d.weeks} />
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="text-lg font-bold text-ink px-4 pt-4 pb-2">Weekly check-ins</h3>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Week</th><th className={th}>Ending</th><th className={th}>Target</th><th className={th}>Weigh-ins</th><th className={th}>Average</th><th className={th}>Δ</th><th className={th}>Status</th><th className={th}>Notes</th></tr></thead>
          <tbody>
            {d.weeks.map((w) => (
              <tr key={w.week} className={w.from <= today && today <= w.weekEnding ? 'bg-taxi-soft' : ''}>
                <td className={td}>{w.week}</td>
                <td className={td}>{nice(w.weekEnding)}</td>
                <td className={td}>{w.targetKg ?? '—'}</td>
                <td className={cx(td, 'text-stone-500')}>{w.weighIns.map((x) => x.kg).join(' · ') || '—'}</td>
                <td className={cx(td, 'font-semibold text-ink')}>{w.actualAvgKg ?? '—'}</td>
                <td className={td}>{w.deltaKg == null ? '' : `${w.deltaKg > 0 ? '+' : ''}${w.deltaKg}`}</td>
                <td className={td}><span className={cx('inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold', STATUS[w.status][1])}>{STATUS[w.status][0]}</span></td>
                <td className={cx(td, 'text-stone-500')}>{[w.photo && 'Photo', w.notes].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {d.months.length > 0 && (
        <Card className="overflow-x-auto">
          <h3 className="text-lg font-bold text-ink px-4 pt-4 pb-2">Monthly</h3>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Month</th><th className={th}>Dates</th><th className={th}>Target end</th><th className={th}>Actual end</th><th className={th}>Target loss</th><th className={th}>Actual loss</th></tr></thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.month}>
                  <td className={td}>{m.month}</td><td className={td}>{nice(m.from)} – {nice(m.to)}</td><td className={td}>{m.endTargetKg ?? '—'}</td>
                  <td className={cx(td, 'font-semibold text-ink')}>{m.actualEndKg ?? '—'}</td><td className={td}>{m.targetLossKg ?? '—'}</td><td className={td}>{m.actualLossKg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function WeightChart({ weights, weeks }) {
  const targets = weeks.filter((w) => w.targetKg != null).map((w) => ({ date: w.weekEnding, kg: w.targetKg }));
  if (!targets.length && weights.length < 2) return <p className="text-sm text-stone-500">Log your weight in the Hub app to see the trend.</p>;
  const W = 900, H = 260, P = { l: 40, r: 12, t: 12, b: 26 };
  const all = [...targets, ...weights];
  const ts = all.map((x) => Date.parse(x.date));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const vals = all.map((x) => x.kg);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (date) => P.l + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v) => P.t + ((hi - v) / (hi - lo)) * (H - P.t - P.b);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.round((hi - lo) / 5));
  const ticks = []; for (let v = lo; v <= hi; v += step) ticks.push(v);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Weight against weekly target">
        {ticks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#dfe3da" /><text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#56606a" fontFamily="var(--font-mono)">{v}</text></g>)}
        {targets.length > 1 && <path d={line(targets)} fill="none" stroke="#3bb57c" strokeWidth="2" strokeDasharray="5 4" />}
        {weights.length > 1 && <path d={line(weights)} fill="none" stroke="#1c2024" strokeWidth="2.5" strokeLinejoin="round" />}
        {weights.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={3.5} fill="#ffc93c" stroke="#1c2024" strokeWidth="1.5"><title>{`${nice(p.date)}: ${p.kg} kg`}</title></circle>)}
        <text x={P.l} y={H - 6} fontSize="11" fill="#56606a" fontFamily="var(--font-mono)">{nice(new Date(t0).toISOString().slice(0, 10))}</text>
        <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="11" fill="#56606a" fontFamily="var(--font-mono)">{nice(new Date(t1).toISOString().slice(0, 10))}</text>
      </svg>
      <div className="flex gap-4 text-xs text-stone-500 mt-2">
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-[2.5px] border-ink" />Weigh-ins</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-zone-green" />Target</span>
      </div>
    </>
  );
}
