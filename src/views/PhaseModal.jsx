import { useState } from 'react';
import { ListPlus, Plus, Trash } from 'lucide-react';
import { phaseProgress, useStore } from '../store';
import { phaseTone } from '../theme';
import { Badge, Button, Checkbox, EmptyState, IconButton, MicroHeading, Modal, ProgressBar, TaskItem, cx, inputClass } from '../ui';
import { PhaseForm, TaskForm } from '../forms';

// inline: render the details in place (expanded row) instead of inside a modal.
export default function PhaseModal({ phaseId, onClose, inline }) {
  const { state, actions } = useStore();
  const phase = state.phases.find((p) => p.id === phaseId);
  const [newTopic, setNewTopic] = useState('');
  const [editingTask, setEditingTask] = useState(null); // task | { topicId } | 'new' | null
  const [editingPhase, setEditingPhase] = useState(false);

  if (!phase) return null;

  const tone = phaseTone(phase);
  const progress = phaseProgress(phase, state.tasks);
  const linked = state.tasks.filter((t) => t.phaseId === phase.id);
  const ordered = [...linked.filter((t) => t.status !== 'done'), ...linked.filter((t) => t.status === 'done')];
  const tasksForTopic = (topicId) => linked.filter((t) => t.topicId === topicId).length;

  const addTopic = async (e) => {
    e.preventDefault();
    const title = newTopic.trim();
    if (title && (await actions.addTopic(phase.id, title))) setNewTopic('');
  };

  const editBtn = <Button variant="ghost" onClick={() => setEditingPhase(true)}>Edit phase</Button>;
  const wrap = (children) => inline
    ? <div className="space-y-4 px-4 pb-4 pt-3 border-t border-stone-200">{children}<div className="flex justify-end">{editBtn}</div></div>
    : <Modal open title={`${phase.order}. ${phase.title}`} onClose={onClose} wide footer={editBtn}>{children}</Modal>;

  const isExisting = editingTask && editingTask !== 'new' && editingTask.id;

  return (
    <>
      {wrap(<>
        <div className="flex flex-wrap items-center gap-3">
          {phase.months && <Badge tone={tone}>{phase.months}</Badge>}
          <span className="text-xs text-stone-500">{progress.done} of {progress.total} items done</span>
          <span className="ml-auto text-2xl font-extrabold font-display text-stone-900">{progress.percent}%</span>
        </div>
        <ProgressBar percent={progress.percent} gradient />

        <div className={cx('flex items-center gap-3 p-4 rounded-2xl border', tone.panel)}>
          <Checkbox
            checked={phase.deliverableDone}
            label="Deliverable achieved"
            onChange={() => actions.updatePhase(phase.id, { deliverableDone: !phase.deliverableDone })}
          />
          <span className="flex-1">
            <span className={cx('block text-[11px] font-bold uppercase tracking-wider', tone.text)}>Key deliverable / outcome</span>
            <span className={cx('block text-sm font-semibold text-stone-900 mt-0.5', phase.deliverableDone && 'line-through text-stone-400')}>
              {phase.deliverable || 'No deliverable set. Use Edit phase to add one.'}
            </span>
          </span>
        </div>

        <div>
          <MicroHeading hint={`${phase.topics.filter((t) => t.done).length}/${phase.topics.length} mastered`}>What to learn:</MicroHeading>
          <div className="space-y-1.5">
            {phase.topics.map((topic) => {
              const count = tasksForTopic(topic.id);
              return (
                <div
                  key={topic.id}
                  className={cx(
                    'group flex items-center gap-3 px-3 py-2 rounded-xl border',
                    topic.done ? 'bg-emerald-50 border-emerald-200' : 'border-stone-100 hover:border-stone-200',
                  )}
                >
                  <Checkbox round checked={topic.done} label={topic.title} onChange={() => actions.updateTopic(phase.id, topic.id, { done: !topic.done })} />
                  <span className={cx('flex-1 text-sm font-medium', topic.done ? 'text-emerald-800' : 'text-stone-800')}>{topic.title}</span>
                  {count > 0 && <Badge tone={tone}>{count} task{count > 1 ? 's' : ''}</Badge>}
                  <div className="flex sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <IconButton icon={ListPlus} label="Add task for this topic" onClick={() => setEditingTask({ topicId: topic.id })} />
                    <IconButton
                      icon={Trash}
                      label="Delete topic"
                      className="hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => window.confirm(`Delete topic "${topic.title}"?`) && actions.deleteTopic(phase.id, topic.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={addTopic} className="flex gap-2 mt-3">
            <input className={inputClass} value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Add a topic…" />
            <Button type="submit" icon={Plus} disabled={!newTopic.trim()}>Add</Button>
          </form>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Linked tasks ({linked.filter((t) => t.status === 'done').length}/{linked.length})
            </span>
            <Button variant="soft" icon={Plus} onClick={() => setEditingTask('new')}>Add task</Button>
          </div>
          {linked.length === 0 ? (
            <EmptyState text="Link tasks to this phase to track real work toward it." />
          ) : (
            <div className="space-y-2">
              {ordered.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  category={state.categories.find((c) => c.id === t.categoryId)}
                  phase={phase}
                  onEdit={() => setEditingTask(t)}
                />
              ))}
            </div>
          )}
        </div>

        {phase.notes && (
          <div>
            <MicroHeading>Notes</MicroHeading>
            <p className="text-sm text-stone-700 whitespace-pre-line leading-relaxed">{phase.notes}</p>
          </div>
        )}
      </>)}

      <TaskForm
        open={!!editingTask}
        task={isExisting ? editingTask : null}
        defaults={{
          phaseId: phase.id,
          topicId: editingTask && editingTask !== 'new' && !editingTask.id ? editingTask.topicId : null,
          categoryId: state.categories.find((c) => c.name === 'Career')?.id || null,
        }}
        onClose={() => setEditingTask(null)}
      />
      <PhaseForm open={editingPhase} phase={phase} onClose={() => setEditingPhase(false)} onDeleted={onClose} />
    </>
  );
}
