import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, NotebookPen, Pencil, Plug, Plus, Trash, X } from 'lucide-react';
import { learningApi } from '../../api';
import { useStore } from '../../store';
import { formatDate } from '../../dates';
import { Badge, Button, Card, EmptyState, IconButton, Modal, SectionTitle, cx, inputClass, selectClass } from '../../ui';
import { TONES } from '../../theme';

// Learning tab "Notes": topics with points, written here or with the Chrome notes extension.
// `courses` maps a note's courseSlug (from the Coursera page it was taken on) to a course name.
export default function NotesSection({ courses }) {
  const { actions } = useStore();
  const [notes, setNotes] = useState(null);
  const [filter, setFilter] = useState(''); // course slug, '' = all, '-' = not linked to a course
  const [adding, setAdding] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);

  const load = useCallback(async () => {
    const list = await actions.run(() => learningApi.notes());
    if (list) setNotes(list);
  }, [actions]);
  useEffect(() => {
    load();
  }, [load]);

  // Server returns the whole note after every change; put it back in place (or first, when new).
  const replace = (note) =>
    note && setNotes((list) => (list.some((n) => n.id === note.id) ? list.map((n) => (n.id === note.id ? note : n)) : [note, ...list]));
  const remove = async (note) => {
    if (!window.confirm(`Delete the topic "${note.topic}" and its ${note.points.length} point(s)?`)) return;
    if (await actions.run(() => learningApi.deleteNote(note.id).then(() => true))) setNotes((list) => list.filter((n) => n.id !== note.id));
  };

  const courseName = (slug) => courses.find((c) => c.slug === slug)?.name || slug;
  const slugs = [...new Set((notes || []).map((n) => n.courseSlug).filter(Boolean))];
  const shown = (notes || []).filter((n) => !filter || (filter === '-' ? !n.courseSlug : n.courseSlug === filter));

  return (
    <>
      <SectionTitle
        icon={NotebookPen}
        iconClass="text-zone-mag"
        subtitle="Topics and points you note while learning. Add them here or with the Chrome extension."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" icon={Plug} onClick={() => setExtensionOpen(true)}>Notes extension</Button>
            <Button variant="soft" icon={Plus} onClick={() => setAdding(true)}>New topic</Button>
          </div>
        }
      >
        Notes
      </SectionTitle>

      {slugs.length > 0 && (
        <select className={cx(selectClass, 'mb-3')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notes by course">
          <option value="">All courses ({notes.length})</option>
          {slugs.map((s) => <option key={s} value={s}>{courseName(s)}</option>)}
          <option value="-">Not linked to a course</option>
        </select>
      )}

      {adding && <NewTopicCard onCancel={() => setAdding(false)} onSaved={(note) => (replace(note), setAdding(false))} />}

      {notes && !notes.length && !adding && (
        <EmptyState icon={NotebookPen} title="No notes yet" text="Add a topic here, or install the Chrome extension to take notes while you study." />
      )}
      {!notes && <p className="text-sm text-stone-500">Loading notes…</p>}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {shown.map((n) => (
          <NoteCard key={n.id} note={n} courseName={n.courseSlug && courseName(n.courseSlug)} onChange={replace} onDelete={() => remove(n)} />
        ))}
      </div>

      <ExtensionModal open={extensionOpen} onClose={() => setExtensionOpen(false)} />
    </>
  );
}

function NewTopicCard({ onCancel, onSaved }) {
  const { actions } = useStore();
  const [topic, setTopic] = useState('');
  const [points, setPoints] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    // One point per line.
    const note = await actions.run(() => learningApi.createNote({ topic, points: points.split('\n') }));
    if (note) onSaved(note);
  };
  return (
    <Card block className="p-5 mb-5">
      <form onSubmit={save} className="space-y-3">
        <input autoFocus className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. CAP theorem" maxLength={200} />
        <textarea
          className={cx(inputClass, 'h-28')}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder={'One point per line\nConsistency vs availability during a partition\n…'}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={!topic.trim()}>Save topic</Button>
        </div>
      </form>
    </Card>
  );
}

function NoteCard({ note, courseName, onChange, onDelete }) {
  const { actions } = useStore();
  const [renaming, setRenaming] = useState(false);
  const [topic, setTopic] = useState(note.topic);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [newPoint, setNewPoint] = useState('');

  const rename = async (e) => {
    e.preventDefault();
    if (topic.trim() && topic !== note.topic) onChange(await actions.run(() => learningApi.renameNote(note.id, topic)));
    setRenaming(false);
  };
  const startEdit = (p) => {
    setEditingId(p.id);
    setEditText(p.text);
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (editText.trim()) onChange(await actions.run(() => learningApi.updatePoint(note.id, editingId, editText)));
    setEditingId(null);
  };
  const add = async (e) => {
    e.preventDefault();
    if (!newPoint.trim()) return;
    const saved = await actions.run(() => learningApi.addPoints(note.id, [newPoint]));
    if (saved) {
      onChange(saved);
      setNewPoint('');
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-2">
        {renaming ? (
          <form onSubmit={rename} className="flex-1 flex gap-2">
            <input autoFocus className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={rename} maxLength={200} />
          </form>
        ) : (
          <h3 className="flex-1 min-w-0 text-base font-bold text-ink leading-snug">{note.topic}</h3>
        )}
        <div className="flex shrink-0">
          {note.pageUrl && (
            <a href={note.pageUrl} target="_blank" rel="noopener noreferrer" title={note.pageTitle || 'Open the page'} className="p-1.5 rounded-lg text-stone-500 hover:text-ink hover:bg-stone-100">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <IconButton icon={Pencil} label="Rename topic" onClick={() => (setTopic(note.topic), setRenaming(true))} />
          <IconButton icon={Trash} label="Delete topic" className="hover:text-rose-600 hover:bg-rose-50" onClick={onDelete} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {courseName && <Badge tone={TONES.emerald}>{courseName}</Badge>}
        <span className="text-[11px] text-stone-500">
          {note.points.length} point{note.points.length === 1 ? '' : 's'} · updated {formatDate(note.updatedAt.slice(0, 10))}
        </span>
      </div>

      <ol className="mt-3 space-y-1.5">
        {note.points.map((p, i) => (
          <li key={p.id} className="group flex items-start gap-2.5">
            <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full border-[1.5px] border-ink bg-white font-mono text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            {editingId === p.id ? (
              <form onSubmit={saveEdit} className="flex-1 flex gap-1">
                <textarea
                  autoFocus
                  className={cx(inputClass, 'py-1.5 min-h-9')}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) saveEdit(e);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <IconButton icon={Check} label="Save point" onClick={saveEdit} />
                <IconButton icon={X} label="Cancel" onClick={() => setEditingId(null)} />
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm text-stone-800 whitespace-pre-line">{p.text}</span>
                <span className="flex sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <IconButton icon={Pencil} label="Edit point" onClick={() => startEdit(p)} />
                  <IconButton
                    icon={Trash}
                    label="Delete point"
                    className="hover:text-rose-600 hover:bg-rose-50"
                    onClick={async () => onChange(await actions.run(() => learningApi.deletePoint(note.id, p.id)))}
                  />
                </span>
              </>
            )}
          </li>
        ))}
      </ol>

      <form onSubmit={add} className="flex gap-2 mt-3">
        <input className={cx(inputClass, 'py-1.5')} value={newPoint} onChange={(e) => setNewPoint(e.target.value)} placeholder="Add a point…" />
        <Button type="submit" variant="soft" icon={Plus} disabled={!newPoint.trim()}>Add</Button>
      </form>
    </Card>
  );
}

function ExtensionModal({ open, onClose }) {
  const { actions } = useStore();
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setToken('');
    (async () => {
      const res = await actions.run(() => learningApi.notesToken());
      if (res) setToken(res.token);
    })();
  }, [open, actions]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // Clipboard blocked: the key is selectable in the box.
    }
  };

  return (
    <Modal open={open} title="Chrome notes extension" onClose={onClose} wide footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <ol className="space-y-3 text-sm text-stone-700 list-decimal pl-5">
        <li>
          In Chrome open <code className="font-mono text-xs bg-stone-100 px-1 rounded">chrome://extensions</code>, turn on <b>Developer mode</b>, click{' '}
          <b>Load unpacked</b> and choose the <code className="font-mono text-xs bg-stone-100 px-1 rounded">extension</code> folder of this project.
        </li>
        <li>Pin it from the puzzle-piece menu. Its icon or <b>Ctrl+Shift+Y</b> opens the notes in Chrome's side panel, beside the page you're learning on.</li>
        <li>
          Paste this key into the extension and click <b>Connect</b>. It can only read and write learning notes, and lasts a year.
          <textarea readOnly className={cx(inputClass, 'mt-2 h-20 font-mono text-[11px]')} value={token || 'Creating key…'} onFocus={(e) => e.target.select()} />
          <Button variant="soft" icon={copied ? Check : Copy} className="mt-2" disabled={!token} onClick={copy}>
            {copied ? 'Copied' : 'Copy key'}
          </Button>
        </li>
      </ol>
      <p className="text-xs text-stone-500">
        Tip: select text on any page, right-click and choose <b>Add to learning notes</b> to add it as a point to the topic you last saved to.
      </p>
    </Modal>
  );
}
