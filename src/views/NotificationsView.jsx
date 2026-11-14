import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Bell, CalendarClock, Check, CheckCheck, Clock, SkipForward, Sun, Trash, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { Button, Card, EmptyState, IconButton, PageHero, cx } from '../ui';

// Inbox of notifications the server builds from tasks (reminders, due soon, morning summary).
// The same notifications are pushed to the phone app. Alerts repeat every 15 minutes until the task
// is done or skipped; Snooze picks when the next one comes.
const KINDS = {
  reminder: { Icon: AlarmClock, label: 'Reminder', tone: 'bg-taxi-soft' },
  due_soon: { Icon: Clock, label: 'Due soon', tone: 'bg-sky-100' },
  digest: { Icon: Sun, label: 'Today', tone: 'bg-emerald-100' },
  overdue: { Icon: TriangleAlert, label: 'Overdue', tone: 'bg-red-100' },
  plan: { Icon: CalendarClock, label: 'Hub · Free time', tone: 'bg-violet-100' },
};

// Done / Skip / Snooze for an alert. Shows its state when skipped or snoozed.
const SNOOZES = [5, 15, 30, 60, 120];
function AlertActions({ n, count, onDone, onSkip, onSnooze }) {
  const [custom, setCustom] = useState('');
  const pick = (v) => {
    if (v === 'custom') return setCustom('30');
    if (v) onSnooze(Number(v));
  };
  const status = n.skipped ? 'Skipped: no more alerts'
    : n.snoozedUntil && new Date(n.snoozedUntil) > new Date() ? `Next alert at ${timeLabel(n.snoozedUntil)}` : 'Repeats every 15 min';
  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0 w-full sm:w-auto">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={onDone} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] border-[1.5px] border-ink bg-taxi text-ink text-xs font-semibold shadow-key active:translate-y-0.5 active:shadow-none">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{count > 1 ? `Done (${count})` : 'Done'}
        </button>
        {!n.skipped && (
          <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] border-[1.5px] border-ink bg-white text-ink text-xs font-semibold">
            <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />Skip
          </button>
        )}
        {custom ? (
          <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onSnooze(Number(custom)); setCustom(''); }}>
            <input type="number" min={1} max={1440} required autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
              aria-label="Remind again after minutes" className="w-16 px-2 py-1 rounded-[10px] border-[1.5px] border-ink text-xs" />
            <button className="px-2 py-1.5 rounded-[10px] border-[1.5px] border-ink bg-white text-xs font-semibold">Set</button>
          </form>
        ) : (
          <select value="" onChange={(e) => pick(e.target.value)} aria-label="Remind again in"
            className="px-2 py-1.5 rounded-[10px] border-[1.5px] border-ink bg-white text-xs font-semibold">
            <option value="">Snooze…</option>
            {SNOOZES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            <option value="custom">Custom…</option>
          </select>
        )}
      </div>
      <span className="font-mono text-[10.5px] text-stone-500">{status}</span>
    </div>
  );
}

const dayLabel = (iso) => {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
};
const timeLabel = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function NotificationsView({ navigate, onUnread }) {
  const { state, actions } = useStore();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all'); // all | unread
  const [error, setError] = useState('');

  const load = useCallback(() => api.notifications()
    .then((r) => { setItems(r.items); onUnread?.(r.unread); setError(''); })
    .catch((e) => setError(e.message)), [onUnread]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const act = (fn) => fn().then(load).catch((e) => setError(e.message));
  const openTasks = (n) => (n.taskIds || []).map((id) => state.tasks.find((t) => t.id === id)).filter((t) => t && t.status !== 'done');
  const done = (n) => act(async () => {
    if (n.plan) return api.doneNotification(n.id);
    for (const t of openTasks(n)) await actions.updateTask(t.id, { status: 'done' });
    await api.readNotification(n.id);
  });
  const open = (n) => {
    if (!n.readAt) api.readNotification(n.id).then(load).catch(() => {});
    const task = n.taskId && state.tasks.find((t) => t.id === n.taskId);
    if (n.plan) return; // a Hub plan item: Done / Skip / Snooze are right here
    navigate('tasks', task ? { openTaskId: task.id, mode: task.mode } : {});
  };

  const unread = (items || []).filter((n) => !n.readAt).length;
  const shown = (items || []).filter((n) => filter === 'all' || !n.readAt);
  const groups = [];
  shown.forEach((n) => {
    const label = dayLabel(n.sentAt || n.createdAt);
    if (groups.at(-1)?.label !== label) groups.push({ label, list: [] });
    groups.at(-1).list.push(n);
  });

  return (
    <>
      <PageHero
        icon={Bell}
        eyebrow="Inbox"
        title="Notifications"
        description="Made from your tasks and pushed to your phone. Alerts repeat every 15 minutes until you mark it done or skip it; snooze to choose when the next one comes. Includes Hub plan items scheduled in your free time, and a summary at 08:00."
        actions={(
          <>
            <Button variant="soft" icon={CheckCheck} disabled={!unread} onClick={() => act(api.readAllNotifications)}>Mark all read</Button>
            <Button variant="soft" icon={Trash} disabled={!items?.some((n) => n.readAt)} onClick={() => act(api.clearReadNotifications)}>Clear read</Button>
          </>
        )}
      >
        <div className="flex gap-1.5 mt-4" role="tablist" aria-label="Show">
          {[['all', 'All'], ['unread', `Unread${unread ? ` (${unread})` : ''}`]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cx('px-3 py-1.5 rounded-[10px] text-xs font-semibold transition', filter === k ? 'bg-taxi text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'bg-stone-100 text-stone-700 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHero>

      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-5">
        {!items ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : !shown.length ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'All caught up' : 'No notifications yet'} text="Turn on “Remind me” on a task, or give it a due time, and notifications appear here." />
        ) : groups.map((g) => (
          <section key={g.label} className="mb-5">
            <h2 className="font-mono text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">{g.label}</h2>
            <Card className="divide-y divide-stone-200 overflow-hidden">
              {g.list.map((n) => {
                const k = KINDS[n.kind] || KINDS.reminder;
                return (
                  <div key={n.id} className={cx('flex flex-wrap sm:flex-nowrap items-start gap-3 p-3 sm:p-4', !n.readAt && 'bg-taxi-soft/40')}>
                    <span className={cx('w-9 h-9 shrink-0 rounded-xl border-[1.5px] border-ink flex items-center justify-center', k.tone)}>
                      <k.Icon className="w-4 h-4 text-ink" aria-hidden="true" />
                    </span>
                    <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        {!n.readAt && <span className="w-2 h-2 rounded-full bg-zone-blue shrink-0" aria-label="Unread" />}
                        <span className={cx('text-sm truncate', n.readAt ? 'font-medium text-stone-700' : 'font-bold text-ink')}>{n.title}</span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">{n.body}</p>
                      <p className="font-mono text-[11px] text-stone-400 mt-1">
                        {k.label} · {timeLabel(n.sentAt || n.createdAt)}{n.repeats ? ` · repeated ${n.repeats}×` : ''}{n.pushed ? ' · sent to phone' : ''}
                      </p>
                    </button>
                    {(n.plan ? !n.done && !n.skipped : n.taskIds?.length > 0 && openTasks(n).length > 0) && (
                      <AlertActions n={n} count={n.plan ? 1 : openTasks(n).length} onDone={() => done(n)}
                        onSkip={() => act(() => api.skipNotification(n.id))}
                        onSnooze={(m) => act(() => api.snoozeNotification(n.id, m))} />
                    )}
                    <IconButton icon={Trash} label="Delete notification" onClick={() => act(() => api.deleteNotification(n.id))} />
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
