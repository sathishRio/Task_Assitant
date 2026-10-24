import { useEffect, useRef } from 'react';
import { Bell, Calendar, Check, Flag, Pencil, Sparkles, Trash, TriangleAlert, X } from 'lucide-react';
import { useStore } from './store';
import { phaseTone, priorityOf, toneFor, TONES } from './theme';
import { formatDate, isOverdue, todayStr } from './dates';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

/* ---------- §5.1 Buttons ---------- */

// DevOBJ buttons: ink outline with a hard "key" shadow that presses down on click.
const KEY = 'border-[1.5px] border-ink rounded-[10px] active:translate-y-0.5 active:shadow-none';
const BUTTONS = {
  primary: `px-4 py-2.5 bg-ink hover:bg-stone-800 text-white text-xs font-semibold shadow-[0_3px_0_#000] ${KEY}`,
  taxi: `px-4 py-2.5 bg-taxi hover:bg-[#ffd35f] text-ink text-xs font-semibold shadow-key ${KEY}`,
  soft: `px-3 py-2 bg-white hover:bg-stone-50 text-ink text-xs font-semibold shadow-key ${KEY}`,
  dark: `px-4 py-3 bg-ink hover:bg-stone-800 text-white text-sm font-semibold shadow-[0_3px_0_#000] ${KEY}`,
  ghost: 'px-3 py-1.5 text-stone-600 hover:text-ink hover:bg-stone-100 rounded-[10px] text-xs font-medium',
  danger: 'px-3 py-1.5 text-rose-700 bg-white hover:bg-rose-50 border-[1.5px] border-rose-600 rounded-[10px] text-xs font-semibold',
};

export function Button({ variant = 'primary', icon: Icon, children, className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTONS[variant],
        className,
      )}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx('p-1.5 rounded-lg text-stone-500 hover:text-ink hover:bg-stone-100 transition', className)}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/* ---------- §5.2 Inputs ---------- */

export const inputClass =
  'w-full px-3.5 py-2.5 bg-white border-[1.5px] border-stone-300 rounded-[10px] text-ink text-sm placeholder:text-stone-400 focus:outline-none focus:border-ink focus:ring-4 focus:ring-zone-blue/15 transition';
export const selectClass =
  'px-3 py-2 rounded-[10px] border-[1.5px] border-stone-300 text-xs font-semibold bg-white text-stone-700 focus:outline-none focus:border-ink focus:ring-4 focus:ring-zone-blue/15';

export function Field({ label, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="block font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function Checkbox({ checked, onChange, round, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cx(
        'w-5 h-5 shrink-0 flex items-center justify-center border-[1.5px] border-ink transition',
        round ? 'rounded-full' : 'rounded-[5px]',
        checked ? 'bg-zone-green text-ink' : 'bg-white hover:bg-taxi-soft',
      )}
    >
      {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
    </button>
  );
}

/* ---------- Surfaces ---------- */

// DevOBJ isometric cube: ink left face, blue right face, taxi-yellow top.
export function CubeMark({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="4,10 16,17 16,30 4,23" fill="var(--color-ink)" />
      <polygon points="28,10 16,17 16,30 28,23" fill="var(--color-zone-blue)" />
      <polygon points="16,3 28,10 16,17 4,10" fill="var(--color-taxi)" />
    </svg>
  );
}

// Cube + "Task Assistant", with the "DevOBJ · private" tag beside it (hidden on narrow screens unless `large`).
export function Brand({ large }) {
  return (
    <span className="flex items-center gap-2.5">
      <CubeMark className={large ? 'w-10 h-10' : 'w-8 h-8'} />
      <span className={cx('font-display font-extrabold tracking-[-0.03em] text-ink whitespace-nowrap', large ? 'text-2xl' : 'text-xl')}>
        Task Assistant
      </span>
      {!large && (
        <span className="hidden xl:inline font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-500 border-l-[1.5px] border-stone-300 pl-2.5 whitespace-nowrap">
          DevOBJ · private
        </span>
      )}
    </span>
  );
}

// `block` = ink outline + hard shadow, for the one panel that should stand out; plain cards stay quiet.
export function Card({ className, children, block, ...props }) {
  return (
    <div
      {...props}
      className={cx(
        'bg-white rounded-2xl border-[1.5px]',
        block ? 'border-ink shadow-block' : 'border-stone-300',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Micro badge (§2 "Badge / Pill"). `tone` comes from theme.js.
export function Badge({ tone = TONES.stone, upper, pill, icon: Icon, children, className }) {
  return (
    <span
      style={tone.style}
      className={cx(
        'inline-flex items-center gap-1 border font-semibold whitespace-nowrap',
        pill ? 'rounded-full px-2.5 py-0.5 text-[11px]' : 'rounded-md px-2 py-0.5',
        upper ? 'font-mono text-[10.5px] uppercase tracking-wide' : !pill && 'text-[11px]',
        tone.badge,
        className,
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

export function ProgressBar({ percent, color = '#3bb57c', gradient, dark, thin }) {
  // The overall career progress (`gradient`) is drawn as a road; phase bars stay thin and zone-coloured.
  if (gradient) {
    return (
      <div className="road" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${percent}%`, ...(percent ? {} : { borderRightWidth: 0 }) }} />
      </div>
    );
  }
  return (
    <div className={cx('w-full rounded-full overflow-hidden', thin ? 'h-1.5' : 'h-2', dark ? 'bg-white/10' : 'bg-stone-100')}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

// §5.3 metric stat card.
export function MetricCard({ label, icon: Icon, value, valueClass = 'text-stone-900', suffix, note, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('p-3 bg-white rounded-xl border-[1.5px] border-stone-300 text-left', onClick && 'hover:border-ink hover:bg-taxi-soft transition')}
    >
      <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={cx('text-2xl font-extrabold font-display tracking-tight tabular-nums', valueClass)}>{value}</span>
        {suffix && <span className="text-xs font-semibold text-emerald-600">{suffix}</span>}
      </div>
      {note && <div className="text-xs text-stone-500 mt-0.5">{note}</div>}
    </Tag>
  );
}

export function PageHero({ icon: Icon, eyebrow, title, description, actions, children }) {
  return (
    <Card block className="p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          {eyebrow && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              {Icon && <Icon className="w-3.5 h-3.5 text-ink" />}
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-ink mt-1.5">{title}</h1>
          {description && <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

export function SectionTitle({ icon: Icon, iconClass = 'text-zone-blue', children, subtitle, action }) {
  return (
    <div className="flex items-end justify-between gap-4 mt-8 mb-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
          {Icon && <Icon className={cx('w-5 h-5', iconClass)} />}
          {children}
        </h2>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function MicroHeading({ children, hint }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="font-mono text-xs font-semibold text-stone-700 uppercase tracking-wider">{children}</span>
      {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, text }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-6 bg-white rounded-2xl border-[1.5px] border-dashed border-stone-300">
      <div className="w-10 h-10 rounded-xl bg-taxi-soft border-[1.5px] border-ink flex items-center justify-center">
        <Icon className="w-5 h-5 text-ink" />
      </div>
      {title && <h3 className="text-base font-bold text-stone-800 mt-3">{title}</h3>}
      <p className="text-xs text-stone-500 mt-1">{text}</p>
    </div>
  );
}

// Dark "philosophy" card with tips, as at the bottom of the web views.
export function InsightCard({ title, intro, tips }) {
  return (
    <div className="bg-ink rounded-2xl p-5 sm:p-6 mt-8 shadow-block-taxi">
      <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-taxi">
        <Sparkles className="w-4 h-4" />
        {title}
      </h3>
      {intro && <p className="text-sm text-on-ink mt-3 leading-relaxed">{intro}</p>}
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        {tips.map(([heading, text]) => (
          <div key={heading} className="rounded-xl bg-white/5 border border-white/10 p-3.5">
            <div className="text-sm font-bold text-white">{heading}</div>
            <p className="text-xs text-on-ink mt-1 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- §5.5 Modal ---------- */

// Open modals in stacking order, so Escape closes only the top one.
const modalStack = [];

export function Modal({ open, title, onClose, footer, children, wide }) {
  // Kept in a ref so a new onClose each render doesn't re-register (and re-stack) the modal.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = {};
    modalStack.push(entry);
    const onKey = (e) => e.key === 'Escape' && modalStack.at(-1) === entry && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(entry), 1);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'w-full bg-white rounded-2xl shadow-block border-[1.5px] border-ink overflow-hidden flex flex-col max-h-[90vh]',
          wide ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        <div className="px-6 py-4 border-b-[1.5px] border-stone-200 bg-stone-50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink truncate">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="p-6 overflow-y-auto space-y-5 flex-1">{children}</div>
        {footer && <div className="px-6 py-3 border-t-[1.5px] border-stone-200 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Task card ---------- */

function DueLabel({ task, done }) {
  const time = task.dueTime ? ` ${task.dueTime}` : '';
  const bell = task.reminder && !done && <Bell className="w-3.5 h-3.5 text-amber-500" aria-label="Reminder set" />;
  let label;
  if (isOverdue(task)) {
    label = <Badge tone={TONES.rose} icon={TriangleAlert}>Overdue ({formatDate(task.dueDate)}{time})</Badge>;
  } else if (task.dueDate === todayStr() && !done) {
    label = <Badge tone={TONES.emerald}>Due Today{time}</Badge>;
  } else {
    label = (
      <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
        <Calendar className="w-3.5 h-3.5 text-stone-400" />
        Due {formatDate(task.dueDate)}{time}
      </span>
    );
  }
  return <div className="flex items-center gap-2">{label}{bell}</div>;
}

// Compact list row for panels (Home): checkbox, title, due on the right, mono tags underneath.
export function TaskRow({ task, category, onEdit }) {
  const { actions } = useStore();
  const done = task.status === 'done';
  const pr = priorityOf(task.priority);
  const overdue = isOverdue(task);
  const due = !task.dueDate ? '' : overdue ? 'Overdue' : formatDate(task.dueDate) + (task.dueTime ? ` ${task.dueTime}` : '');
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3">
      <div className="row-span-2 pt-0.5">
        <Checkbox checked={done} onChange={() => actions.toggleTask(task)} label={`Mark "${task.title}" done`} />
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={cx('text-left text-sm font-semibold text-ink hover:text-zone-blue truncate', done && 'line-through text-stone-500')}
      >
        {task.title}
      </button>
      <span className={cx('font-mono text-[11.5px] font-semibold whitespace-nowrap pt-0.5', overdue ? 'text-rose-700' : 'text-stone-500')}>
        {task.reminder && !done && <Bell className="inline w-3 h-3 mr-1 -mt-0.5 text-stone-500" aria-label="Reminder set" />}
        {due}
      </span>
      <div className="col-start-2 col-span-2 flex flex-wrap gap-1.5">
        <Badge tone={pr.tone} upper>{pr.label}</Badge>
        {category && <Badge tone={toneFor(category.color)} upper>{category.name}</Badge>}
        {task.status === 'in_progress' && <Badge tone={TONES.emerald} upper>In progress</Badge>}
      </div>
    </div>
  );
}

export function TaskItem({ task, category, phase, onEdit }) {
  const { actions } = useStore();
  const done = task.status === 'done';
  const pr = priorityOf(task.priority);
  const topic = phase && task.topicId ? phase.topics.find((t) => t.id === task.topicId) : null;

  return (
    <Card
      className={cx(
        'group p-4 transition hover:border-ink',
        isOverdue(task) && 'border-rose-600 bg-rose-50/40',
        done && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Checkbox checked={done} onChange={() => actions.toggleTask(task)} label={`Mark "${task.title}" done`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={onEdit}
              className={cx('text-sm font-semibold text-left text-ink hover:text-zone-blue', done && 'line-through text-stone-400')}
            >
              {task.title}
            </button>
            {!done && <Badge tone={pr.tone} upper>{pr.label}</Badge>}
          </div>
          {(category || phase || task.status === 'in_progress') && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {category && <Badge tone={toneFor(category.color)}>{category.name}</Badge>}
              {task.status === 'in_progress' && <Badge tone={TONES.emerald}>In progress</Badge>}
              {phase && <Badge tone={phaseTone(phase)} icon={Flag}>{topic ? topic.title : phase.title}</Badge>}
            </div>
          )}
          {task.dueDate && <div className="mt-2"><DueLabel task={task} done={done} /></div>}
          {task.notes && <p className="text-xs text-stone-500 mt-2 line-clamp-2">{task.notes}</p>}
        </div>
        <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition">
          <IconButton icon={Pencil} label="Edit task" onClick={onEdit} />
          <IconButton
            icon={Trash}
            label="Delete task"
            className="hover:text-rose-600 hover:bg-rose-50"
            onClick={() => window.confirm(`Delete "${task.title}"? This cannot be undone.`) && actions.deleteTask(task.id)}
          />
        </div>
      </div>
    </Card>
  );
}
