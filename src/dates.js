// Same date helpers as mobile/src/dates.js. Dates are stored as YYYY-MM-DD strings.
const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayStr = () => toDateStr(new Date());

export const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};

// String comparison matches chronological order for YYYY-MM-DD.
export const isOverdue = (task) => !!task.dueDate && task.status !== 'done' && task.dueDate < todayStr();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDate = (s) => {
  if (!s) return '';
  if (s === todayStr()) return 'Today';
  if (s === addDays(1)) return 'Tomorrow';
  if (s === addDays(-1)) return 'Yesterday';
  const [y, m, d] = s.split('-').map(Number);
  const sameYear = y === new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${sameYear ? '' : ` ${y}`}`;
};

export const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
};
