import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { notePaper } from '../theme';

// Flat DevOBJ town plan for sticky notes: grid paper with Downtown (pinned notes), Midtown and the Suburbs,
// and Note Ave across the middle with taxis driving by. Notes are taped down with washi tape and can be
// dragged anywhere: dropping one Downtown pins it, dragging a pinned note out unpins it. The board is laid
// out on a fixed 1136×600 stage and scaled to fit; animations live in index.css (town-*).

const STAGE = { w: 1136, h: 600 };
const NOTE = { w: 150, h: 140 };
const DOWNTOWN = { x: 22, y: 22, w: 560, h: 236 };
const MIDTOWN = { x: 604, y: 22, w: 510, h: 236 };
const ROAD = { y: 280, h: 50 };
const SUBURBS = { x: 22, y: 352, w: 1092, h: 226 };
const MIN_SCALE = 0.6; // below this the board scrolls sideways instead of shrinking further

// Where free (unpinned) notes may sit; saved x/y (0–1) map onto the note's top-left within this box.
const AREA = { x0: 20, x1: STAGE.w - 20 - NOTE.w, y0: 20, y1: STAGE.h - 20 - NOTE.h };
const DOWNTOWN_SLOTS = [[46, 66], [222, 66], [398, 66]];
const AUTO_SPOTS = [
  [628, 68], [790, 68], [952, 68],
  [46, 396], [216, 396], [386, 396], [556, 396], [726, 396], [896, 396],
];
const TAPES = ['#4c76ff', '#3bb57c', '#ff8a3d', '#e264c6', '#9d85f7', '#38bdd8'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const toStage = (x, y) => ({ x: AREA.x0 + x * (AREA.x1 - AREA.x0), y: AREA.y0 + y * (AREA.y1 - AREA.y0) });
const toNorm = (x, y) => ({
  x: round3(clamp((x - AREA.x0) / (AREA.x1 - AREA.x0), 0, 1)),
  y: round3(clamp((y - AREA.y0) / (AREA.y1 - AREA.y0), 0, 1)),
});
const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// Slot i, stacking further notes slightly offset on top of the first round.
function stacked(spots, i) {
  const [x, y] = spots[i % spots.length];
  const layer = Math.floor(i / spots.length);
  return { x: x + layer * 14, y: y + layer * 12 };
}

// Small deterministic number per note id, so each note keeps its own tilt and tape colour.
function seed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

// Board position of every note, plus the empty plot at the next free spot.
function layout(notes) {
  const pos = new Map();
  const pinned = notes.filter((n) => n.pinned);
  const auto = notes
    .filter((n) => !n.pinned && (n.x == null || n.y == null))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  pinned.forEach((n, i) => pos.set(n.id, stacked(DOWNTOWN_SLOTS, i)));
  auto.forEach((n, i) => pos.set(n.id, stacked(AUTO_SPOTS, i)));
  for (const n of notes) if (!pos.has(n.id)) pos.set(n.id, toStage(n.x, n.y));
  return { pos, plot: stacked(AUTO_SPOTS, auto.length) };
}

const fontSize = (text) => (text.length > 140 ? 12 : text.length > 70 ? 14 : text.length > 28 ? 16 : 20);

export default function TownBoard({ notes, taskTitle, onSelect, onMove, onCreate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState(null); // { id, x, y, moved }
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const [held, setHeld] = useState({}); // id -> {x, y}: kept at the drop spot until the save comes back
  const [leaving, setLeaving] = useState([]); // removed notes playing their exit animation
  const lastSeen = useRef(new Map()); // id -> { note, x, y } from the previous render

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const fit = () => setScale(Math.max(MIN_SCALE, el.clientWidth / (STAGE.w + 8)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // New data replaces any held drop positions; removed notes get a short exit animation.
  useEffect(() => {
    setHeld({});
    const ids = new Set(notes.map((n) => n.id));
    const gone = [...lastSeen.current.values()].filter((e) => !ids.has(e.note.id));
    if (!gone.length) return undefined;
    setLeaving((l) => [...l, ...gone]);
    const t = setTimeout(() => setLeaving((l) => l.filter((e) => !gone.includes(e))), 500);
    return () => clearTimeout(t);
  }, [notes]);

  // A failed save would otherwise leave a note held where it was dropped.
  useEffect(() => {
    if (!Object.keys(held).length) return undefined;
    const t = setTimeout(() => setHeld({}), 6000);
    return () => clearTimeout(t);
  }, [held]);

  const { pos, plot } = layout(notes);
  const placed = notes.map((n) => {
    const p = drag?.id === n.id ? drag : held[n.id] || pos.get(n.id);
    return { note: n, x: p.x, y: p.y };
  });
  lastSeen.current = new Map(placed.map((e) => [e.note.id, e]));

  const over = drag?.moved ? inside(DOWNTOWN, drag.x + NOTE.w / 2, drag.y + NOTE.h / 2) : false;

  const down = (e, note, p) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { note, startX: e.clientX, startY: e.clientY, ox: p.x, oy: p.y, moved: false };
  };

  const move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (!d.moved && Math.hypot(dx, dy) * scale < 5) return;
    d.moved = true;
    d.x = clamp(d.ox + dx, 0, STAGE.w - NOTE.w);
    d.y = clamp(d.oy + dy, 0, STAGE.h - NOTE.h);
    setDrag({ id: d.note.id, moved: true, x: d.x, y: d.y });
  };

  const up = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const { note } = d;
    let { x, y } = d;
    setDrag(null);
    const cx = x + NOTE.w / 2;
    if (inside(DOWNTOWN, cx, y + NOTE.h / 2)) {
      // Dropped Downtown: pin it (it moves into its slot once saved); a pinned note just snaps back.
      if (!note.pinned) {
        setHeld({ [note.id]: { x, y } });
        onMove(note, { pinned: true });
      }
      return;
    }
    // Notes never park on the road; push them to the nearer side (never up into Downtown).
    if (y + NOTE.h > ROAD.y && y < ROAD.y + ROAD.h) {
      const upSide = y + NOTE.h / 2 < ROAD.y + ROAD.h / 2 && cx > DOWNTOWN.x + DOWNTOWN.w;
      y = upSide ? ROAD.y - NOTE.h - 10 : ROAD.y + ROAD.h + 10;
    }
    x = clamp(x, AREA.x0, AREA.x1);
    y = clamp(y, AREA.y0, AREA.y1);
    setHeld({ [note.id]: { x, y } });
    onMove(note, { ...toNorm(x, y), ...(note.pinned ? { pinned: false } : {}) });
  };

  const cancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const click = (note) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(note);
  };

  return (
    <div ref={wrapRef} className="overflow-x-auto overflow-y-hidden pb-2">
      <div style={{ width: STAGE.w * scale + 8, height: STAGE.h * scale + 8 }}>
        <div className="town-board" style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${scale})` }}>
          <District r={DOWNTOWN} label="Downtown · pinned" tone="downtown" active={over} />
          <District r={MIDTOWN} label="Midtown · notes" tone="midtown" />
          <District r={SUBURBS} label="Suburbs · notes" tone="suburbs" />

          <div className="town-road" style={{ top: ROAD.y, height: ROAD.h }}>
            <span className="town-lane" />
            <span className="town-street-sign">Note Ave</span>
            <Car className="town-car town-car-east" color="#ffc93c" />
            <Car className="town-car town-car-west" color="#4c76ff" />
          </div>

          <button
            type="button"
            className="town-plot"
            style={{ left: plot.x, top: plot.y, width: NOTE.w, height: NOTE.h }}
            onClick={onCreate}
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
            <span>Empty plot</span>
            <span>New note</span>
          </button>

          {placed.map(({ note, x, y }, i) => (
            <Note
              key={note.id}
              note={note}
              x={x}
              y={y}
              index={i}
              title={note.taskId ? taskTitle(note.taskId) : ''}
              dragging={drag?.id === note.id}
              onPointerDown={(e) => down(e, note, { x, y })}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onClick={() => click(note)}
            />
          ))}
          {leaving.map(({ note, x, y }) => (
            <Note key={`leaving-${note.id}`} note={note} x={x} y={y} title="" leaving />
          ))}
        </div>
      </div>
    </div>
  );
}

function District({ r, label, tone, active }) {
  return (
    <>
      <div className={`town-district town-${tone}${active ? ' is-target' : ''}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      <span className={`town-label town-label-${tone}${active ? ' is-target' : ''}`} style={{ left: r.x + 16, top: r.y - 12 }}>
        {label}
      </span>
    </>
  );
}

function Car({ className, color }) {
  return (
    <span className={className} style={{ backgroundColor: color }} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function Note({ note, x, y, index = 0, title, dragging, leaving, ...handlers }) {
  const s = seed(note.id);
  const style = {
    left: x,
    top: y,
    width: NOTE.w,
    height: NOTE.h,
    backgroundColor: notePaper(note.color),
    '--rot': `${((s - 0.5) * (note.pinned ? 4 : 6)).toFixed(2)}deg`,
    '--tape': TAPES[Math.floor(s * TAPES.length)],
    '--tape-rot': `${((s - 0.5) * 14).toFixed(1)}deg`,
    '--delay': `${Math.min(index, 12) * 45}ms`,
    zIndex: dragging ? 30 : leaving ? 25 : undefined,
  };
  const cls = ['town-note', dragging && 'is-dragging', leaving && 'is-leaving'].filter(Boolean).join(' ');
  if (leaving) {
    return (
      <div className={cls} style={style} aria-hidden="true">
        <span className="town-tape" />
        <span className="town-note-text" style={{ fontSize: fontSize(note.text) }}>{note.text}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      aria-label={`${note.pinned ? 'Pinned note' : 'Note'}: ${note.text}. Drag to move, press to edit.`}
      {...handlers}
    >
      <span className="town-tape" />
      {title && <MapPin className="town-pin" aria-hidden="true" />}
      <span className="town-note-text" style={{ fontSize: fontSize(note.text) }}>{note.text}</span>
      {title && (
        <span className="town-note-task">
          <span className="town-note-task-dot" />
          <span className="truncate">{title}</span>
        </span>
      )}
    </button>
  );
}
