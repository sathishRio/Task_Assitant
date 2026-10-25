import { useEffect, useRef, useState } from 'react';
import { cx } from '../../ui';

// Small SVG charts for the Wealth page (no chart library). Categorical colours follow a
// validated order and always follow the entity (an asset type keeps its colour), never rank.
// Text stays in ink tokens; colour lives on the marks and the legend swatches beside them.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GRID = '#e4e6e0';
const MUTED = '#56606a';
const INK = '#1c2024';
const TAXI = '#ffc93c';
const TAXI_SOFT = '#fff4d1';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// "Nice" axis ticks covering [min, max].
function ticks(min, max, count = 4) {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return out;
}

// Left gutter wide enough for the longest y-axis label (11px text ≈ 6.6px per character).
const gutter = (yTicks, formatTick) => Math.max(40, 14 + Math.max(...yTicks.map((t) => formatTick(t).length)) * 6.6);

export function Legend({ items, className }) {
  return (
    <div className={cx('flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-600', className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cx('shrink-0', it.line ? 'w-3.5 h-0.5 rounded-full' : 'w-2.5 h-2.5 rounded-[3px]')} style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, width, children }) {
  // Flip to the left of the cursor near the right edge.
  const left = x > width - 190;
  return (
    <div
      className="absolute top-2 z-10 pointer-events-none min-w-36 px-3 py-2 rounded-[10px] border-[1.5px] border-ink bg-white text-xs shadow-key"
      style={left ? { right: width - x + 10 } : { left: x + 10 }}
    >
      {children}
    </div>
  );
}

const TipRow = ({ color, label, value }) => (
  <div className="flex items-center gap-2 mt-0.5">
    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
    <span className="text-stone-600 flex-1">{label}</span>
    <span className="font-semibold text-ink tabular-nums">{value}</span>
  </div>
);

/**
 * Multi-series line chart with a hover crosshair.
 * points: [{ label, ...values }], series: [{ key, label, color, dashed?, area? }]
 * `area` shades under that series; `onHover(index | null)` reports the point under the pointer.
 */
export function LineChart({ points, series, format, formatTick, height = 240, ariaLabel, onHover }) {
  const [ref, width] = useWidth();
  const [hover, setHoverState] = useState(null);
  const setHover = (i) => {
    setHoverState(i);
    onHover?.(i);
  };
  const values = points.flatMap((p) => series.map((s) => p[s.key])).filter(Number.isFinite);
  const yTicks = ticks(Math.min(0, ...values), Math.max(0, ...values));
  const pad = { top: 16, right: 16, bottom: 28, left: gutter(yTicks, formatTick) };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const yMin = yTicks[0];
  const yMax = yTicks.at(-1);
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 64))));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = Math.max(0, Math.min(points.length - 1, points.length === 1 ? 0 : Math.round((px / innerW) * (points.length - 1))));
    if (i !== hover) setHover(i);
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK : GRID} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={MUTED} className="tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={p.label} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED}>
                {p.label}
              </text>
            ) : null,
          )}
          {series
            .filter((s) => s.area && points.length > 1 && points.every((p) => Number.isFinite(p[s.key])))
            .map((s) => (
              <path
                key={`${s.key}-area`}
                d={`M${points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' L')} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                fill={TAXI_SOFT}
              />
            ))}
          {series.map((s) => {
            const d = points
              .map((p, i) => (Number.isFinite(p[s.key]) ? `${x(i)},${y(p[s.key])}` : null))
              .filter(Boolean)
              .join(' L');
            return d ? (
              <path key={s.key} d={`M${d}`} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            ) : null;
          })}
          {/* End dots carry the latest value's position for every series. */}
          {series.map((s) => {
            const last = points.length - 1;
            return Number.isFinite(points[last]?.[s.key]) ? (
              <circle key={s.key} cx={x(last)} cy={y(points[last][s.key])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
            ) : null;
          })}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke={INK} strokeWidth="1" strokeDasharray="4 4" />
              {series.map((s) =>
                Number.isFinite(points[hover][s.key]) ? (
                  s.area ? (
                    <rect
                      key={s.key}
                      x={x(hover) - 5}
                      y={y(points[hover][s.key]) - 5}
                      width="10"
                      height="10"
                      rx="2"
                      fill={TAXI}
                      stroke={INK}
                      strokeWidth="2"
                      transform={`rotate(45 ${x(hover)} ${y(points[hover][s.key])})`}
                    />
                  ) : (
                    <circle key={s.key} cx={x(hover)} cy={y(points[hover][s.key])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
                  )
                ) : null,
              )}
            </g>
          )}
          {/* Full-height hit area so hovering anywhere picks the nearest point. */}
          <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" />
        </svg>
      )}
      {hover != null && (
        <Tooltip x={x(hover)} width={width}>
          <div className="font-semibold text-ink">{points[hover].label}</div>
          {series.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} value={format(points[hover][s.key])} />
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Grouped columns (e.g. income vs expenses per month).
 * groups: [{ label, ...values }], series: [{ key, label, color }]
 * `selected` highlights one group; `onSelect(index)` makes the groups clickable.
 */
export function ColumnChart({ groups, series, format, formatTick, height = 220, ariaLabel, extra, selected, onSelect }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const values = groups.flatMap((g) => series.map((s) => g[s.key] || 0));
  const yTicks = ticks(0, Math.max(1, ...values));
  const pad = { top: 12, right: 8, bottom: 28, left: gutter(yTicks, formatTick) };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const yMax = yTicks.at(-1);
  const band = groups.length ? innerW / groups.length : 0;
  const barW = Math.min(24, Math.max(4, (band * 0.7 - 2 * (series.length - 1)) / series.length));
  const y = (v) => pad.top + innerH - (v / yMax) * innerH;

  // Column path with a 4px rounded top and a square base.
  const col = (x0, v) => {
    const top = y(v);
    const h = pad.top + innerH - top;
    if (h <= 0) return '';
    const r = Math.min(4, barW / 2, h);
    return `M${x0},${pad.top + innerH} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${pad.top + innerH} Z`;
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK : GRID} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={MUTED}>
                {formatTick(t)}
              </text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const groupW = series.length * barW + (series.length - 1) * 2;
            const gx = pad.left + gi * band + (band - groupW) / 2;
            return (
              <g
                key={g.label}
                onMouseEnter={() => setHover(gi)}
                onClick={onSelect && (() => onSelect(gi))}
                style={onSelect ? { cursor: 'pointer' } : undefined}
              >
                <rect
                  x={pad.left + gi * band}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  rx="8"
                  fill={selected === gi ? TAXI_SOFT : hover === gi ? '#f4f5f1' : 'transparent'}
                />
                {series.map((s, si) => (
                  <path key={s.key} d={col(gx + si * (barW + 2), g[s.key] || 0)} fill={s.color} stroke={INK} strokeWidth="1.5" />
                ))}
                <text
                  x={pad.left + gi * band + band / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill={selected === gi ? INK : MUTED}
                  fontWeight={selected === gi ? 700 : 400}
                >
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && (
        <Tooltip x={pad.left + hover * band + band / 2} width={width}>
          <div className="font-semibold text-ink">{groups[hover].label}</div>
          {series.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} value={format(groups[hover][s.key] || 0)} />
          ))}
          {extra?.(groups[hover])}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Shares of a whole as one ink-outlined stacked bar plus a list. slices: [{ key, label, value, color }].
 * Clicking a row or a segment focuses it; every row lists its value and share, so nothing
 * depends on colour alone.
 */
export function Allocation({ slices, format, totalLabel }) {
  const [focus, setFocus] = useState(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const active = slices.find((s) => s.key === focus);
  const pick = (key) => setFocus((f) => (f === key ? null : key));
  const share = (v) => (total ? `${((v / total) * 100).toFixed(1)}%` : '—');
  const dim = (key) => (focus && focus !== key ? 0.25 : 1);

  return (
    <div>
      <div className="px-4 sm:px-5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-ink truncate">{active ? active.label : totalLabel}</span>
          <span className="font-display text-xl font-extrabold tracking-tight text-ink tabular-nums whitespace-nowrap">
            {format(active ? active.value : total)}
            {active && <span className="ml-2 font-mono text-xs font-semibold text-stone-500">{share(active.value)}</span>}
          </span>
        </div>
        <div className="flex h-6 mt-3 rounded-md border-[1.5px] border-ink bg-white overflow-hidden">
          {slices.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-label={`${s.label}, ${share(s.value)}`}
              onClick={() => pick(s.key)}
              className="relative h-full min-w-[3px] border-r-[1.5px] border-ink last:border-r-0"
              style={{ flex: `${s.value} 1 0` }}
            >
              <span className="absolute inset-0 transition-opacity" style={{ backgroundColor: s.color, opacity: dim(s.key) }} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t-[1.5px] border-stone-200">
        {slices.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pick(s.key)}
            aria-pressed={focus === s.key}
            className={cx(
              'w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-stone-100 last:border-0 text-left text-sm transition',
              focus === s.key ? 'bg-taxi-soft font-semibold text-ink' : 'text-stone-700 hover:bg-stone-50',
            )}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-[2px] border-[1.5px] border-ink shrink-0" style={{ backgroundColor: s.color, opacity: dim(s.key) }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex gap-3 font-mono text-xs font-semibold tabular-nums">
              <span className="text-ink">{format(s.value)}</span>
              <span className="w-12 text-right text-stone-400">{share(s.value)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar against a limit (budget vs actual). Over the limit turns critical, with a label. */
export function LimitBar({ value, limit }) {
  const pct = limit > 0 ? Math.min(100, (value / limit) * 100) : value > 0 ? 100 : 0;
  const over = value > limit;
  const color = over ? '#e34948' : pct >= 85 ? '#eda100' : '#1baf7a';
  return (
    <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
