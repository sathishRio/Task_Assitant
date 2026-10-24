import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { useStore } from './store';
import { CATEGORY_COLORS, CERT_STATUSES, NOTE_COLORS, PRIORITIES, STATUSES, modeOf } from './theme';
import { Button, Field, ModeSwitch, Modal, cx, inputClass } from './ui';

// Shared shell: modal + form + Cancel/Save footer, with an optional Delete on the left.
function FormModal({ open, title, onClose, onSubmit, onDelete, deleteLabel, children, wide }) {
  const formId = useId();
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit();
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide={wide}
      footer={
        <>
          {onDelete && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              {deleteLabel}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        {children}
      </form>
    </Modal>
  );
}

const confirmDelete = (what) => window.confirm(`Delete ${what}? This cannot be undone.`);

// Not a <Field>: a <label> around the switch would forward stray clicks to its first button.
function WorkspaceField({ value, onChange }) {
  return (
    <div>
      <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Workspace</span>
      <ModeSwitch value={value} onChange={onChange} />
    </div>
  );
}

/* ---------- Task ---------- */

const emptyTask = (defaults) => ({
  title: '', notes: '', categoryId: null, priority: 'medium', status: 'todo',
  dueDate: null, dueTime: null, reminder: false, phaseId: null, topicId: null, mode: 'personal', ...defaults,
});

export function TaskForm({ open, task, defaults, onClose }) {
  const { state, actions } = useStore();
  const [form, setForm] = useState(emptyTask(defaults));
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm(task ? { ...emptyTask(), ...task, mode: modeOf(task) } : emptyTask(defaults));
    setError('');
    // `defaults` is read once per opening on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const phase = state.phases.find((p) => p.id === form.phaseId);

  const save = async () => {
    const title = form.title.trim();
    if (!title) return setError('Task needs a title'), false;
    if (form.reminder && !form.dueDate) return setError('Pick a due date for the reminder'), false;
    const data = {
      title, notes: form.notes.trim(), categoryId: form.categoryId, priority: form.priority, status: form.status,
      dueDate: form.dueDate || null, dueTime: form.dueTime || null, reminder: form.reminder,
      phaseId: form.phaseId, topicId: form.topicId, mode: form.mode,
    };
    return task ? actions.updateTask(task.id, data) : actions.createTask(data);
  };

  return (
    <FormModal
      open={open}
      title={task ? 'Edit Task' : 'New Task & Reminder'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Task"
      onDelete={task && (async () => confirmDelete('this task') && (await actions.deleteTask(task.id)) && onClose())}
    >
      <WorkspaceField value={form.mode} onChange={(mode) => set({ mode })} />
      <Field label="Title">
        <input autoFocus className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="What needs to be done?" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Category">
          <select className={inputClass} value={form.categoryId || ''} onChange={(e) => set({ categoryId: e.target.value || null })}>
            <option value="">None</option>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Due date">
          <input
            type="date"
            className={inputClass}
            value={form.dueDate || ''}
            onChange={(e) => set({ dueDate: e.target.value || null, ...(e.target.value ? {} : { reminder: false }) })}
          />
        </Field>
        <Field label="Due time">
          <input type="time" className={inputClass} value={form.dueTime || ''} disabled={!form.dueDate} onChange={(e) => set({ dueTime: e.target.value || null })} />
        </Field>
      </div>
      <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-emerald-600"
          checked={form.reminder}
          disabled={!form.dueDate}
          onChange={(e) => set({ reminder: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Remind me</span>
          <span className="block text-xs text-stone-500">
            Notifies on your phone at {form.dueTime || '09:00'} on the due date
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Career goal phase">
          <select className={inputClass} value={form.phaseId || ''} onChange={(e) => set({ phaseId: e.target.value || null, topicId: null })}>
            <option value="">None</option>
            {state.phases.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.title}</option>)}
          </select>
        </Field>
        <Field label="Topic">
          <select
            className={inputClass}
            value={form.topicId || ''}
            disabled={!phase || !phase.topics.length}
            onChange={(e) => set({ topicId: e.target.value || null })}
          >
            <option value="">Whole phase</option>
            {phase?.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional details" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Category ---------- */

export function CategoryForm({ open, category, onClose }) {
  const { state, actions } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(category ? category.name : '');
    setColor(category ? category.color : CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length]);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Category needs a name'), false;
    const data = { name: trimmed, color };
    return category ? actions.updateCategory(category.id, data) : actions.createCategory(data);
  };

  const taskCount = category ? state.tasks.filter((t) => t.categoryId === category.id).length : 0;

  return (
    <FormModal
      open={open}
      title={category ? 'Edit Category' : 'New Category'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Category"
      onDelete={
        category &&
        (async () =>
          confirmDelete(`"${category.name}"${taskCount ? ` (${taskCount} task${taskCount > 1 ? 's' : ''} will become uncategorized)` : ''}`) &&
          (await actions.deleteCategory(category.id)) &&
          onClose())
      }
    >
      <Field label="Name">
        <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side Project" />
      </Field>
      <div>
        <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Color</span>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={cx('w-10 h-10 rounded-xl flex items-center justify-center transition', color === c && 'ring-2 ring-offset-2 ring-stone-900')}
              style={{ backgroundColor: c }}
            >
              {color === c && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Sticky note ---------- */

const NOTE_MAX = 500;

// `mode` is the workspace a new note starts in.
export function NoteForm({ open, note, mode = 'personal', onClose }) {
  const { state, actions } = useStore();
  const [form, setForm] = useState({ text: '', color: 'taxi', pinned: false, taskId: null, mode });
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm(
      note
        ? { text: note.text, color: note.color, pinned: note.pinned, taskId: note.taskId, mode: modeOf(note) }
        : { text: '', color: 'taxi', pinned: false, taskId: null, mode },
    );
    setError('');
    // `mode` is read once per opening on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note]);

  // Open tasks in the note's workspace, plus the linked one even if it is already done.
  const tasks = state.tasks.filter((t) => modeOf(t) === form.mode && (t.status !== 'done' || t.id === form.taskId));
  // Moving a note to the other workspace drops a link to a task that stays behind.
  const setMode = (next) => {
    const linked = state.tasks.find((t) => t.id === form.taskId);
    set({ mode: next, ...(linked && modeOf(linked) !== next ? { taskId: null } : {}) });
  };

  const submit = async () => {
    const text = form.text.trim();
    if (!text) {
      setError('Write something on the note.');
      return false;
    }
    const data = { ...form, text };
    return note ? actions.updateNote(note.id, data) : actions.createNote(data);
  };

  return (
    <FormModal
      open={open}
      title={note ? 'Edit note' : 'New sticky note'}
      onClose={onClose}
      onSubmit={submit}
      deleteLabel="Delete note"
      onDelete={note && (async () => confirmDelete('this note') && (await actions.deleteNote(note.id)) && onClose())}
    >
      <WorkspaceField value={form.mode} onChange={setMode} />
      <Field label={`Note (${form.text.length}/${NOTE_MAX})`}>
        <textarea
          autoFocus
          rows={4}
          maxLength={NOTE_MAX}
          className={cx(inputClass, 'resize-none')}
          style={{ backgroundColor: NOTE_COLORS.find((c) => c.key === form.color)?.paper }}
          value={form.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="e.g. Ask about the AZ-305 exam voucher"
        />
      </Field>
      <div>
        <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Color</span>
        <div className="flex flex-wrap gap-2.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={c.label}
              aria-pressed={form.color === c.key}
              onClick={() => set({ color: c.key })}
              className={cx('w-10 h-10 rounded-[10px] border-[1.5px] border-ink flex items-center justify-center transition', form.color === c.key && 'shadow-key -translate-y-0.5')}
              style={{ backgroundColor: c.paper }}
            >
              {form.color === c.key && <Check className="w-5 h-5 text-ink" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      <Field label="Linked task (optional)">
        <select className={cx(inputClass, 'py-2')} value={form.taskId || ''} onChange={(e) => set({ taskId: e.target.value || null })}>
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-start gap-3 p-3 rounded-[10px] border-[1.5px] border-stone-300 bg-white cursor-pointer">
        <input type="checkbox" className="w-4 h-4 mt-0.5 accent-ink" checked={form.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold text-ink">Pin to top</span>
          <span className="block text-xs text-stone-500">Pinned notes live Downtown on the town plan and come first in lists.</span>
        </span>
      </label>
      {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
    </FormModal>
  );
}

/* ---------- Career phase ---------- */

export function PhaseForm({ open, phase, onClose, onDeleted }) {
  const { state, actions } = useStore();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm({
      title: phase?.title || '', months: phase?.months || '', deliverable: phase?.deliverable || '',
      notes: phase?.notes || '', order: String(phase?.order ?? state.phases.length + 1),
    });
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  const save = async () => {
    if (!form.title?.trim()) return setError('Phase needs a title'), false;
    const data = {
      title: form.title.trim(), months: form.months.trim(), deliverable: form.deliverable.trim(),
      notes: form.notes.trim(), order: Number(form.order) || 0,
    };
    return phase ? actions.updatePhase(phase.id, data) : actions.createPhase(data);
  };

  return (
    <FormModal
      open={open}
      title={phase ? 'Edit Phase' : 'New Phase'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete Phase"
      onDelete={
        phase &&
        (async () => {
          if (!confirmDelete(`"${phase.title}" (linked tasks are kept but un-linked)`)) return;
          if (await actions.deletePhase(phase.id)) {
            onClose();
            onDeleted?.();
          }
        })
      }
    >
      <Field label="Title">
        <input autoFocus className={inputClass} value={form.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Azure Cloud" />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Timeframe" className="col-span-2">
          <input className={inputClass} value={form.months || ''} onChange={(e) => set({ months: e.target.value })} placeholder="Months 3–4" />
        </Field>
        <Field label="Order">
          <input type="number" className={inputClass} value={form.order || ''} onChange={(e) => set({ order: e.target.value })} />
        </Field>
      </div>
      <Field label="Deliverable">
        <textarea rows={2} className={inputClass} value={form.deliverable || ''} onChange={(e) => set({ deliverable: e.target.value })} placeholder="What proves this phase is done?" />
      </Field>
      <Field label="Notes">
        <textarea rows={3} className={inputClass} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Resources, links, reflections…" />
      </Field>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Certification ---------- */

export function CertificationForm({ open, cert, onClose }) {
  const { actions } = useStore();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm({
      code: cert?.code || '', name: cert?.name || '', status: cert?.status || 'planned',
      optional: cert?.optional || false, targetDate: cert?.targetDate || null,
    });
    setError('');
  }, [open, cert]);

  const save = async () => {
    if (!form.code?.trim()) return setError('Certification needs a code or short name'), false;
    const data = { ...form, code: form.code.trim(), name: form.name.trim(), targetDate: form.targetDate || null };
    return cert ? actions.updateCertification(cert.id, data) : actions.createCertification(data);
  };

  return (
    <FormModal
      open={open}
      title={cert ? 'Edit Certification' : 'New Certification'}
      onClose={onClose}
      onSubmit={save}
      deleteLabel="Delete"
      onDelete={cert && (async () => confirmDelete(cert.code) && (await actions.deleteCertification(cert.id)) && onClose())}
    >
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code">
          <input autoFocus className={inputClass} value={form.code || ''} onChange={(e) => set({ code: e.target.value })} placeholder="AZ-305" />
        </Field>
        <Field label="Full name" className="col-span-2">
          <input className={inputClass} value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="Azure Solutions Architect Expert" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <select className={inputClass} value={form.status || 'planned'} onChange={(e) => set({ status: e.target.value })}>
            {CERT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Target exam date">
          <input type="date" className={inputClass} value={form.targetDate || ''} onChange={(e) => set({ targetDate: e.target.value || null })} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium text-stone-700 cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.optional} onChange={(e) => set({ optional: e.target.checked })} />
        Optional certification
      </label>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </FormModal>
  );
}

/* ---------- Career profile ---------- */

const PROFILE_TEXT_FIELDS = [
  ['goal', 'Career goal', 'e.g. Enterprise Solution Architect'],
  ['currentRole', 'Current role', ''],
  ['experience', 'Experience', 'e.g. 10 years'],
  ['location', 'Location', ''],
  ['currentSalary', 'Current salary', ''],
  ['shortTermTarget', 'Next target (1–2 yrs)', ''],
  ['mediumTermTarget', 'Medium-term target (3–5 yrs)', ''],
];

export function ProfileForm({ open, onClose }) {
  const { state, actions } = useStore();
  const [form, setForm] = useState({});
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    const p = state.profile || {};
    setForm({
      ...Object.fromEntries(PROFILE_TEXT_FIELDS.map(([k]) => [k, p[k] || ''])),
      principle: p.principle || '',
      targetRoles: (p.targetRoles || []).join('\n'),
      skillPriorities: (p.skillPriorities || []).join('\n'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const lines = (s) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const save = () =>
    actions.updateProfile({
      ...Object.fromEntries(PROFILE_TEXT_FIELDS.map(([k]) => [k, (form[k] || '').trim()])),
      principle: (form.principle || '').trim(),
      targetRoles: lines(form.targetRoles),
      skillPriorities: lines(form.skillPriorities),
    });

  return (
    <FormModal open={open} title="Career Profile" onClose={onClose} onSubmit={save} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROFILE_TEXT_FIELDS.map(([key, label, placeholder]) => (
          <Field key={key} label={label} className={key === 'goal' ? 'sm:col-span-2' : undefined}>
            <input className={inputClass} value={form[key] || ''} onChange={(e) => set({ [key]: e.target.value })} placeholder={placeholder} />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Target roles (one per line)">
          <textarea rows={5} className={inputClass} value={form.targetRoles || ''} onChange={(e) => set({ targetRoles: e.target.value })} />
        </Field>
        <Field label="Focus areas (one per line)">
          <textarea rows={5} className={inputClass} value={form.skillPriorities || ''} onChange={(e) => set({ skillPriorities: e.target.value })} />
        </Field>
      </div>
      <Field label="Guiding principle">
        <textarea rows={2} className={inputClass} value={form.principle || ''} onChange={(e) => set({ principle: e.target.value })} />
      </Field>
    </FormModal>
  );
}
