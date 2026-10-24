// Semantic tokens from reference/DESIGN_SYSTEM.md §3, as literal Tailwind classes
// (Tailwind only generates classes it can find written out in the source).
const tone = (accent, badge, panel, text) => ({ accent, badge, panel, text });

export const TONES = {
  emerald: tone('#10b981', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-emerald-50/60 border-emerald-200', 'text-emerald-700'),
  sky: tone('#0ea5e9', 'bg-sky-50 text-sky-700 border-sky-200', 'bg-sky-50/60 border-sky-200', 'text-sky-700'),
  indigo: tone('#6366f1', 'bg-indigo-50 text-indigo-700 border-indigo-200', 'bg-indigo-50/60 border-indigo-200', 'text-indigo-700'),
  teal: tone('#14b8a6', 'bg-teal-50 text-teal-700 border-teal-200', 'bg-teal-50/60 border-teal-200', 'text-teal-700'),
  amber: tone('#f59e0b', 'bg-amber-50 text-amber-700 border-amber-200', 'bg-amber-50/60 border-amber-200', 'text-amber-700'),
  stone: tone('#78716c', 'bg-stone-100 text-stone-700 border-stone-200', 'bg-stone-50 border-stone-200', 'text-stone-700'),
  purple: tone('#9333ea', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-purple-50/60 border-purple-200', 'text-purple-700'),
  rose: tone('#f43f5e', 'bg-rose-50 text-rose-700 border-rose-200', 'bg-rose-50/60 border-rose-200', 'text-rose-700'),
  red: tone('#ef4444', 'bg-red-50 text-red-700 border-red-200', 'bg-red-50/60 border-red-200', 'text-red-700'),
  blue: tone('#3b82f6', 'bg-blue-50 text-blue-700 border-blue-200', 'bg-blue-50/60 border-blue-200', 'text-blue-700'),
  orange: tone('#ff8a3d', 'bg-orange-50 text-orange-700 border-orange-200', 'bg-orange-50/60 border-orange-200', 'text-orange-700'),
  pink: tone('#e264c6', 'bg-pink-50 text-pink-700 border-pink-200', 'bg-pink-50/60 border-pink-200', 'text-pink-700'),
};

// The 8 domain accents (§3.3); new categories pick from these.
export const CATEGORY_COLORS = ['emerald', 'sky', 'indigo', 'teal', 'amber', 'stone', 'purple', 'rose'].map((k) => TONES[k].accent);

// Colors saved by the mobile app's older palette and the server seed map to the nearest domain tone.
const LEGACY = {
  '#059669': 'emerald', '#0284c7': 'sky', '#4f46e5': 'indigo', '#0d9488': 'teal', '#d97706': 'amber',
  '#e11d48': 'rose', '#8b5cf6': 'purple', '#ef4444': 'red', '#3b82f6': 'blue',
};
const BY_ACCENT = Object.fromEntries(Object.values(TONES).map((t) => [t.accent, t]));

export function toneFor(hex) {
  const key = (hex || '').toLowerCase();
  if (BY_ACCENT[key]) return BY_ACCENT[key];
  if (LEGACY[key]) return TONES[LEGACY[key]];
  if (!hex) return TONES.stone;
  // Unknown custom color: inline styles instead of classes.
  return { accent: hex, badge: '', panel: '', text: '', style: { backgroundColor: hex + '14', color: hex, borderColor: hex + '40' } };
}

// Roadmap phases, by phase order (1-based); later phases cycle. One DevOBJ zone colour each:
// cyan, blue, violet, orange, magenta, green.
const PHASE_TONES = [
  { ...TONES.teal, accent: '#38bdd8' },
  { ...TONES.sky, accent: '#4c76ff' },
  { ...TONES.purple, accent: '#9d85f7' },
  TONES.orange,
  TONES.pink,
  { ...TONES.emerald, accent: '#3bb57c' },
];
export const phaseTone = (phase) => PHASE_TONES[(Math.max(1, phase?.order || 1) - 1) % PHASE_TONES.length];

// §3.4 priority badges.
export const PRIORITIES = [
  { key: 'high', label: 'High', rank: 0, tone: tone('#ffc93c', 'bg-taxi text-ink border-ink') },
  { key: 'medium', label: 'Medium', rank: 1, tone: tone('#0ea5e9', 'bg-sky-50 text-sky-700 border-sky-200') },
  { key: 'low', label: 'Low', rank: 2, tone: tone('#78716c', 'bg-stone-100 text-stone-600 border-stone-200') },
];
export const priorityOf = (key) => PRIORITIES.find((p) => p.key === key) || PRIORITIES[1];

export const STATUSES = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export const CERT_STATUSES = [
  { key: 'planned', label: 'Planned', tone: TONES.stone },
  { key: 'studying', label: 'Studying Now', tone: TONES.amber },
  { key: 'scheduled', label: 'Exam Booked', tone: TONES.sky },
  { key: 'passed', label: 'Passed', tone: TONES.emerald },
];

// Sticky-note colours (DevOBJ zone names, as saved by the API) and their paper tone: the light
// "top face" colours from devobj.com, so ink text stays readable on every note.
export const NOTE_COLORS = [
  { key: 'taxi', label: 'Taxi yellow', paper: '#ffc93c' },
  { key: 'blue', label: 'Blue', paper: '#c9d6ff' },
  { key: 'green', label: 'Green', paper: '#a8e0c2' },
  { key: 'orange', label: 'Orange', paper: '#ffc9a0' },
  { key: 'violet', label: 'Violet', paper: '#c9bcff' },
  { key: 'pink', label: 'Pink', paper: '#f6c4ea' },
];
export const notePaper = (key) => (NOTE_COLORS.find((c) => c.key === key) || NOTE_COLORS[0]).paper;
