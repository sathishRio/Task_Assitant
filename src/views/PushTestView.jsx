import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BellRing, CircleCheck, CircleX, LoaderCircle, RefreshCw, Send, Smartphone, Trash } from 'lucide-react';
import { api } from '../api';
import { Button, Card, EmptyState, Field, IconButton, MicroHeading, PageHero, cx, inputClass } from '../ui';

// Push test (#/push-test, from Notifications): the phone app installs signed up for notifications on this
// account (browsers don't get push), a test send to one or all of them (plain, or an alert with Done / Skip /
// Remind me), what Firebase answered, and which button was pressed on the phone. Test alerts change no tasks.

const KINDS = [
  { key: 'plain', label: 'Plain notification', hint: 'Title and text only, no buttons.' },
  { key: 'reminder', label: 'Task reminder', hint: 'With Done, Skip and Remind me buttons.' },
  { key: 'due_soon', label: 'Due soon (timer)', hint: 'Counts down to a due time 10 minutes away.' },
  { key: 'overdue', label: 'Overdue', hint: 'Shows how long ago it was due (5 minutes).' },
  { key: 'plan', label: 'Hub plan item now', hint: 'Free-time item ending in 30 minutes.' },
];
const DELAYS = [[0, 'Now'], [10, 'In 10 seconds'], [30, 'In 30 seconds'], [60, 'In 1 minute'], [120, 'In 2 minutes']];
const POLL_MS = 3000;
const POLL_FOR_MS = 5 * 60 * 1000;
const PRESSED = { done: 'Done was pressed', skip: 'Skip was pressed', snooze: 'Remind me was pressed' };

// What an error from Firebase usually means, in plain words.
function hintFor(error = '') {
  if (/third-party-auth-error/.test(error)) return 'Apple rejected Firebase: the APNs key in Firebase (Project settings → Cloud Messaging) is missing or wrong (Key ID, Team ID, or a different app).';
  if (/registration-token-not-registered/.test(error)) return 'This app install is no longer registered (reinstalled, or the token changed). In the app: Settings → Daily reminder → Turn off, then Turn on.';
  if (/invalid-registration-token|invalid-argument/.test(error)) return 'The device token is not valid. In the app, turn reminders off and on again.';
  if (/mismatched-credential|sender-id-mismatch/.test(error)) return "The server's FIREBASE_SERVICE_ACCOUNT is from a different Firebase project than the app.";
  if (/FIREBASE_SERVICE_ACCOUNT/.test(error)) return 'Check FIREBASE_SERVICE_ACCOUNT on the API server: the service-account JSON, or a path to it.';
  return '';
}
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Result({ ok, children, hint }) {
  return (
    <div className={cx('text-xs rounded-[10px] px-3 py-2 border', ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700')}>
      <div className="flex items-start gap-1.5">
        {ok ? <CircleCheck className="w-3.5 h-3.5 mt-px shrink-0" /> : <CircleX className="w-3.5 h-3.5 mt-px shrink-0" />}
        <span className="min-w-0 break-words">{children}</span>
      </div>
      {hint && <p className="text-stone-600 mt-1 ml-5">{hint}</p>}
    </div>
  );
}

function SetupRow({ ok, label, fix }) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <span className={cx('w-2.5 h-2.5 rounded-full shrink-0', ok ? 'bg-emerald-500' : 'bg-rose-600')} aria-hidden="true" />
        <span className="text-stone-700">{label}:</span>
        <b className={ok ? 'text-emerald-700' : 'text-rose-700'}>{ok ? 'set up' : 'not set up'}</b>
      </div>
      {!ok && <p className="text-xs text-stone-500 mt-0.5 ml-[18px]">{fix}</p>}
    </div>
  );
}

export default function PushTestView({ navigate }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ kind: 'reminder', deviceId: '', delay: 0, title: '', body: '' });
  const [run, setRun] = useState(null); // the last test: { id, kind, state, results, pressed, ... }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now()); // for the "sending in" countdown
  const pollUntil = useRef(0);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(() => api.pushTestStatus().then((s) => { setStatus(s); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // After a send: read back the result and any button press every few seconds, for a while.
  useEffect(() => {
    if (!run?.id) return undefined;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (Date.now() > pollUntil.current) return clearInterval(t);
      try { const r = await api.pushTestResult(run.id); setRun((cur) => ({ ...cur, ...r })); } catch { /* keep the last answer */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [run?.id]);

  const send = async (override = {}) => {
    const b = { ...form, ...override };
    setBusy(true);
    setError('');
    try {
      const r = await api.pushTestSend({
        kind: b.kind, deviceId: b.deviceId || undefined, delay: Number(b.delay),
        title: b.title.trim() || undefined, body: b.body.trim() || undefined,
      });
      pollUntil.current = Date.now() + POLL_FOR_MS + Number(b.delay) * 1000;
      setNow(Date.now());
      setRun({ ...r, kind: b.kind });
      if (r.state !== 'waiting') load(); // dead devices may have been removed
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.label} from this account? It stops getting notifications until reminders are turned on there again.`)) return;
    try { await api.pushTestRemoveDevice(d.id); await load(); } catch (e) { setError(e.message); }
  };

  const devices = status?.devices || [];
  const resultOf = (id) => run?.results?.find((r) => r.id === id);
  const nameOf = (id) => devices.find((d) => d.id === id)?.label || 'Removed device';
  const kind = KINDS.find((k) => k.key === form.kind);
  const waitLeft = run?.state === 'waiting' ? Math.max(0, Math.ceil((run.sendAt - now) / 1000)) : 0;

  return (
    <>
      <PageHero
        icon={BellRing}
        eyebrow="Notifications"
        title="Push test"
        description="Send a test to the DevOBJ Hub app on your phone and see what came back. Test alerts have working Done, Skip and Remind me buttons and don't change any tasks."
        actions={(
          <>
            <Button variant="soft" icon={ArrowLeft} onClick={() => navigate('notifications')}>Inbox</Button>
            <Button variant="soft" icon={RefreshCw} onClick={load}>Refresh</Button>
          </>
        )}
      />

      {error && <p className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2" role="alert">{error}{hintFor(error) && <><br />{hintFor(error)}</>}</p>}

      {!status ? (
        <div className="flex justify-center mt-16"><LoaderCircle className="w-7 h-7 text-ink animate-spin" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 mt-5 items-start">
          <div className="flex flex-col gap-5">
            <Card className="p-4 sm:p-5">
              <MicroHeading>Server setup</MicroHeading>
              <div className="flex flex-col gap-2.5">
                <SetupRow ok={status.app} label="Phone app (Firebase)" fix="Set FIREBASE_SERVICE_ACCOUNT on the API server and restart it." />
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <MicroHeading hint={`${devices.length} signed up`}>Devices</MicroHeading>
              {!devices.length ? (
                <EmptyState icon={Smartphone} title="No devices yet" text="In the Hub app on your phone, open Settings → Daily reminder → Turn on reminders. Then refresh this page." />
              ) : (
                <div className="divide-y divide-stone-200">
                  {devices.map((d) => {
                    const r = resultOf(d.id);
                    return (
                      <div key={d.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 shrink-0 rounded-xl border-[1.5px] border-ink bg-sky-100 flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-ink" aria-hidden="true" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-ink truncate">{d.label}</div>
                            <div className="font-mono text-[11px] text-stone-400">
                              Signed up {when(d.since)}{d.seen && d.seen !== d.since ? ` · updated ${when(d.seen)}` : ''} · …{d.tail}
                            </div>
                          </div>
                          <Button variant="soft" icon={Send} disabled={busy} onClick={() => send({ deviceId: d.id })}>Test</Button>
                          <IconButton icon={Trash} label={`Remove ${d.label}`} onClick={() => remove(d)} />
                        </div>
                        {r && <Result ok={r.ok} hint={!r.ok && hintFor(r.error)}>{r.ok ? 'Accepted by the push service' : r.error}</Result>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card block className="p-4 sm:p-5">
              <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <MicroHeading>Send a test</MicroHeading>
                <Field label="Type">
                  <select className={inputClass} value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                    {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                  <span className="block text-xs text-stone-500 mt-1">{kind.hint}</span>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="To">
                    <select className={inputClass} value={form.deviceId} onChange={(e) => set({ deviceId: e.target.value })}>
                      <option value="">All devices</option>
                      {devices.map((d) => <option key={d.id} value={d.id}>{d.label} (…{d.tail.slice(-4)})</option>)}
                    </select>
                  </Field>
                  <Field label="When">
                    <select className={inputClass} value={form.delay} onChange={(e) => set({ delay: Number(e.target.value) })}>
                      {DELAYS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-stone-500 -mt-1">To test the app in the background or closed, pick a delay, send, then close the app on your phone.</p>
                <Field label="Title (optional)">
                  <input className={inputClass} type="text" maxLength={300} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Test reminder" />
                </Field>
                <Field label="Text (optional)">
                  <input className={inputClass} type="text" maxLength={1000} value={form.body} onChange={(e) => set({ body: e.target.value })} />
                </Field>
                <div>
                  <Button type="submit" variant="taxi" icon={busy ? LoaderCircle : Send} disabled={busy || !devices.length}>{busy ? 'Sending…' : 'Send test'}</Button>
                </div>
              </form>
            </Card>

            {run && (
              <Card className="p-4 sm:p-5" aria-live="polite">
                <MicroHeading hint={KINDS.find((k) => k.key === run.kind)?.label}>Last test</MicroHeading>
                <div className="flex flex-col gap-2">
                  {run.state === 'waiting' && (
                    <p className="text-sm text-ink flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" /> Sending in {waitLeft}s… Close the app on your phone now.</p>
                  )}
                  {run.state === 'failed' && <Result ok={false} hint={hintFor(run.error)}>{run.error}</Result>}
                  {run.state === 'sent' && (
                    <>
                      <p className="text-sm text-ink"><b>{run.sent} of {run.devices}</b> device{run.devices === 1 ? '' : 's'} accepted it.</p>
                      {run.results.map((r) => (
                        <Result key={r.id} ok={r.ok} hint={!r.ok && hintFor(r.error)}>{nameOf(r.id)}{r.ok ? '' : `: ${r.error}`}</Result>
                      ))}
                      {run.sent > 0 && <p className="text-xs text-stone-500">“Accepted” means Firebase took it. If it still doesn't show on the phone, check its notification settings and Focus / Do Not Disturb.</p>}
                    </>
                  )}
                  {run.state === 'unknown' && <p className="text-xs text-stone-500">The server restarted, so the send result is gone. Button presses still show below.</p>}
                  {run.kind !== 'plain' && run.state !== 'failed' && (
                    run.pressed ? (
                      <Result ok>
                        <b>{PRESSED[run.pressed]}</b>
                        {run.pressed === 'snooze' && run.snoozedUntil ? ` (next at ${new Date(run.snoozedUntil).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })})` : ''}. Phone buttons work.
                      </Result>
                    ) : (
                      <p className="text-xs text-stone-500">Waiting for a button press on the phone (Done, Skip or Remind me)…</p>
                    )
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
