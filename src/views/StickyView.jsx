import { useMemo, useState } from 'react';
import { Link2, Pin, Plus, StickyNote } from 'lucide-react';
import { useStore } from '../store';
import { MODES, modeOf, notePaper } from '../theme';
import { Button, EmptyState, ModeSwitch, PageHero } from '../ui';
import { NoteForm } from '../forms';
import TownBoard from '../sticky/TownBoard';

// Pinned first, then most recently changed.
const byPinnedThenRecent = (a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || '');

export default function StickyView() {
  const { state, actions } = useStore();
  const { tasks, mode } = state;
  // The board and list show the active workspace (Office or Personal) only.
  const notes = useMemo(() => state.notes.filter((n) => modeOf(n) === mode), [state.notes, mode]);
  const modeCounts = useMemo(
    () => Object.fromEntries(MODES.map((m) => [m.key, state.notes.filter((n) => modeOf(n) === m.key).length])),
    [state.notes],
  );
  const modeLabel = MODES.find((m) => m.key === mode).label;
  const [editing, setEditing] = useState(null); // note | 'new' | null

  const taskTitle = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t.title]));
    return (id) => byId.get(id) || '';
  }, [tasks]);

  const sorted = [...notes].sort(byPinnedThenRecent);
  const pinnedCount = notes.filter((n) => n.pinned).length;

  return (
    <div className="space-y-5">
      <PageHero
        icon={StickyNote}
        eyebrow="Sticky notes · town plan"
        title="Sticky Notes"
        description="Notes taped onto the town plan. Drag a note to move it, click it to edit. Pinned notes live Downtown: drop a note there to pin it."
        actions={
          <div className="flex flex-col items-start sm:items-end gap-2">
            <ModeSwitch value={mode} onChange={actions.setMode} counts={modeCounts} />
            <Button icon={Plus} className="text-sm" onClick={() => setEditing('new')}>New note</Button>
          </div>
        }
      />

      <section aria-label="Town plan with your sticky notes">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Drag to move · drop Downtown to pin · click to edit
        </p>
        <TownBoard
          notes={notes}
          taskTitle={taskTitle}
          onSelect={setEditing}
          onMove={(note, patch) => actions.updateNote(note.id, patch)}
          onCreate={() => setEditing('new')}
        />
      </section>

      {/* Plain list: keyboard and screen-reader friendly, and the readable overview on small screens. */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold text-ink">{modeLabel} notes</h2>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            {notes.length} total · {pinnedCount} pinned
          </span>
        </div>
        {sorted.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setEditing(n)}
                className="text-left rounded-xl border-[1.5px] border-ink p-4 transition hover:-translate-y-0.5 hover:shadow-block"
                style={{ backgroundColor: notePaper(n.color) }}
              >
                <span className="flex items-start gap-2">
                  <span className="flex-1 text-sm font-semibold text-ink whitespace-pre-line line-clamp-5">{n.text}</span>
                  {n.pinned && <Pin className="w-4 h-4 shrink-0 text-ink" aria-label="Pinned" />}
                </span>
                {n.taskId && taskTitle(n.taskId) && (
                  <span className="mt-3 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/80">
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{taskTitle(n.taskId)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={StickyNote} title={`No ${modeLabel.toLowerCase()} notes yet`} text="Add a note and it drops onto the town plan." />
        )}
      </section>

      <NoteForm open={!!editing} note={editing === 'new' ? null : editing} mode={mode} onClose={() => setEditing(null)} />
    </div>
  );
}
