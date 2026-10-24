import { Bell, Calendar, Flag, ListChecks, Pin } from 'lucide-react';
import { useStore } from '../store';
import { STATUSES, phaseTone, priorityOf, toneFor, TONES } from '../theme';
import { formatDate, isOverdue } from '../dates';
import { Badge, Button, Checkbox, MicroHeading, Modal, ProgressBar, cx } from '../ui';

const STATUS_TONES = { todo: TONES.stone, in_progress: TONES.emerald, done: TONES.blue };

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-mono text-[11px] font-semibold text-stone-500 uppercase tracking-wider pt-0.5">{label}</span>
      <div className="text-ink">{children}</div>
    </div>
  );
}

// Read-only side panel for one task. `taskId` is looked up live, so it follows edits and ticks.
// `onOpen(id)` switches the panel to another task (an objective or one of its actions).
export default function TaskDetails({ taskId, onOpen, onEdit, onClose }) {
  const { state, actions } = useStore();
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const done = task.status === 'done';
  const pr = priorityOf(task.priority);
  const category = state.categories.find((c) => c.id === task.categoryId);
  const phase = state.phases.find((p) => p.id === task.phaseId);
  const topic = phase && task.topicId ? phase.topics.find((t) => t.id === task.topicId) : null;
  const objective = task.parentId ? state.tasks.find((t) => t.id === task.parentId) : null;
  const subtasks = state.tasks.filter((t) => t.parentId === task.id);
  const subDone = subtasks.filter((t) => t.status === 'done').length;
  const status = STATUSES.find((s) => s.key === task.status);

  const remove = async () => {
    const what = subtasks.length ? `"${task.title}" and its ${subtasks.length} action(s)` : `"${task.title}"`;
    if (window.confirm(`Delete ${what}? This cannot be undone.`) && (await actions.deleteTask(task.id))) onClose();
  };

  return (
    <Modal
      side
      open
      title={objective ? 'Action details' : subtasks.length ? 'Objective details' : 'Task details'}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={remove}>Delete</Button>
          <Button variant="soft" onClick={() => actions.toggleTask(task)}>{done ? 'Reopen' : 'Mark done'}</Button>
          <Button onClick={() => onEdit(task)}>Edit</Button>
        </>
      }
    >
      <div>
        <h3 className={cx('text-xl font-bold text-ink break-words', done && 'line-through text-stone-400')}>
          {task.pinned && <Pin className="inline w-4 h-4 mr-1.5 -mt-1 fill-taxi" aria-label="Pinned" />}
          {task.title}
        </h3>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge tone={STATUS_TONES[task.status]} upper>{status?.label}</Badge>
          <Badge tone={pr.tone} upper>{pr.label}</Badge>
          {category && <Badge tone={toneFor(category.color)}>{category.name}</Badge>}
          {subtasks.length > 0 && <Badge tone={TONES.blue} icon={ListChecks} upper>Objective</Badge>}
          {task.background && <Badge upper>Background</Badge>}
        </div>
      </div>

      <div className="space-y-3">
        <Row label="Due">
          {task.dueDate ? (
            <span className={cx('inline-flex items-center gap-1.5', isOverdue(task) && 'text-rose-700 font-semibold')}>
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(task.dueDate)}{task.dueTime && ` at ${task.dueTime}`}
              {isOverdue(task) && ' · Overdue'}
            </span>
          ) : (
            <span className="text-stone-400">No due date</span>
          )}
        </Row>
        <Row label="Reminder">
          {task.reminder ? (
            <span className="inline-flex items-center gap-1.5"><Bell className="w-3.5 h-3.5 text-amber-500" /> On, at {task.dueTime || '09:00'}</span>
          ) : (
            <span className="text-stone-400">Off</span>
          )}
        </Row>
        {phase && (
          <Row label="Career goal">
            <Badge tone={phaseTone(phase)} icon={Flag}>{phase.order}. {phase.title}{topic && ` — ${topic.title}`}</Badge>
          </Row>
        )}
        {objective && (
          <Row label="Objective">
            <button type="button" onClick={() => onOpen(objective.id)} className="text-left font-semibold hover:text-zone-blue underline-offset-2 hover:underline">
              {objective.title}
            </button>
          </Row>
        )}
        <Row label="Created">{when(task.createdAt)}</Row>
        {done && task.completedAt && <Row label="Completed">{when(task.completedAt)}</Row>}
      </div>

      {subtasks.length > 0 && (
        <div>
          <MicroHeading hint={`${subDone}/${subtasks.length} done`}>Actions</MicroHeading>
          <div><ProgressBar thin percent={Math.round((subDone / subtasks.length) * 100)} /></div>
          <div className="mt-3 space-y-1.5">
            {subtasks.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5">
                <Checkbox checked={a.status === 'done'} onChange={() => actions.toggleTask(a)} label={`Mark "${a.title}" done`} />
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className={cx('flex-1 min-w-0 truncate text-left text-sm hover:text-zone-blue', a.status === 'done' && 'line-through text-stone-400')}
                >
                  {a.title}
                </button>
                {a.dueDate && <span className="font-mono text-[11px] text-stone-500">{formatDate(a.dueDate)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <MicroHeading>Notes</MicroHeading>
        {task.notes ? (
          <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{task.notes}</p>
        ) : (
          <p className="text-sm text-stone-400">No notes</p>
        )}
      </div>
    </Modal>
  );
}
