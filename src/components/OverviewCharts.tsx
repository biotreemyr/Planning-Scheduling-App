/**
 * Charts for Reports → Overview, in plain SVG, drawn the way the Stability Study app's overview
 * draws them. Colours are the dataviz reference palette (validated, light mode): categorical slots
 * in fixed order, status colours only for status and always with their label. Every mark carries
 * a <title>, so hovering shows its value.
 */
import type { ReactNode } from "react";
import { limitText, type YieldRange, type YieldTone } from "@/lib/services/yields";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;
const TONE_COLOUR: Record<YieldTone, string> = { ok: STATUS.good, near: STATUS.warning, out: STATUS.critical, none: "#8a8984" };
export const TONE_LABEL: Record<YieldTone, string> = { ok: "Within limits", near: "Near a limit", out: "Outside limits", none: "No limit set" };

export function StatTile({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: keyof typeof STATUS }) {
  return <div className="viz-tile">
    <p className="viz-tile-label">{tone ? <i className="viz-dot" style={{ background: STATUS[tone] }} aria-hidden="true" /> : null}{label}</p>
    <p className="viz-tile-value">{value}</p>
    {note ? <p className="viz-tile-note">{note}</p> : null}
  </div>;
}

type Bar = { label: string; value: number; title?: string };
type Series = { name: string; color: string; data: Bar[] };

/**
 * Vertical bars from a zero baseline; 4px rounded ends; values above the bars. Two or more series
 * stand side by side in each slot, with a legend.
 */
export function BarChart({ title, data, series, color = SERIES[0], unit = "" }: { title: string; data?: Bar[]; series?: Series[]; color?: string; unit?: string }) {
  const all: Series[] = series ?? [{ name: title, color, data: data ?? [] }];
  const slots = Math.max(...all.map((item) => item.data.length), 1);
  // Many long labels (processes) are tilted so they never run into each other.
  const labels = all[0].data.map((d) => d.label);
  const tilt = labels.length > 5 && labels.some((label) => label.length > 6);
  const width = 380, height = tilt ? 236 : 190;
  const padding = { left: 26, right: 6, top: 18, bottom: tilt ? 72 : 26 };
  const top = Math.max(1, ...all.flatMap((item) => item.data.map((d) => d.value)));
  // Whole-number ticks: counts never show halves.
  const nice = top <= 4 ? 4 : Math.ceil(top / 4) * 4;
  const plotW = width - padding.left - padding.right, plotH = height - padding.top - padding.bottom;
  const slot = plotW / slots;
  const group = Math.min(slot * 0.7, 18 * all.length + 2 * (all.length - 1));
  const barW = (group - 2 * (all.length - 1)) / all.length;
  const y = (value: number) => padding.top + plotH - (value / nice) * plotH;
  // Twelve months show every other label.
  const step = labels.length > 8 && !tilt ? 2 : 1;
  return <figure className="viz-card">
    <figcaption>{title}</figcaption>
    {all.length > 1 ? <ul className="viz-legend viz-legend-inline">
      {all.map((item) => <li key={item.name}><i className="viz-swatch" style={{ background: item.color }} aria-hidden="true" /><span>{item.name}</span></li>)}
    </ul> : null}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${all.map((item) => `${item.name} ${item.data.map((d) => `${d.label} ${d.value}`).join(", ")}`).join("; ")}`}>
      {[0, nice / 2, nice].map((tick) => <g key={tick}>
        <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} className="viz-grid" />
        <text x={padding.left - 6} y={y(tick) + 4} textAnchor="end" className="viz-axis">{tick}</text>
      </g>)}
      {labels.map((label, index) => {
        const cx = padding.left + slot * index + slot / 2;
        return <g key={`${label}-${index}`}>
          {all.map((item, si) => {
            const d = item.data[index];
            if (!d) return null;
            const h = (d.value / nice) * plotH;
            const r = Math.min(4, h / 2, barW / 2);
            const x0 = cx - group / 2 + si * (barW + 2);
            const yTop = padding.top + plotH - h;
            return <g key={item.name} className="viz-mark">
              <title>{d.title ?? `${all.length > 1 ? `${item.name} · ` : ""}${d.label}: ${d.value}${unit}`}</title>
              <rect x={x0 - 1} y={padding.top} width={barW + 2} height={plotH} fill="transparent" />
              {h > 0 ? <path d={`M${x0},${padding.top + plotH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${padding.top + plotH} Z`} fill={item.color} /> : null}
              {d.value > 0 ? <text x={x0 + barW / 2} y={yTop - 4} textAnchor="middle" className="viz-value">{d.value}</text> : null}
            </g>;
          })}
          {index % step !== 0 ? null : tilt
            ? <text x={cx + 4} y={height - padding.bottom + 12} textAnchor="end" transform={`rotate(-40 ${cx + 4} ${height - padding.bottom + 12})`} className="viz-axis">{label.length > 14 ? `${label.slice(0, 13)}…` : label}</text>
            : <text x={cx} y={height - padding.bottom + 14} textAnchor="middle" className="viz-axis">{label}</text>}
        </g>;
      })}
      <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} className="viz-baseline" />
    </svg>
  </figure>;
}

/** Horizontal bars for a handful of named amounts, labelled at both ends. */
export function RowBars({ title, data, color = SERIES[0], max, empty = "Nothing to show." }: { title: string; data: { label: string; value: number; shown?: string; color?: string; title?: string }[]; color?: string; max?: number; empty?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return <figure className="viz-card">
    <figcaption>{title}</figcaption>
    {data.length ? <ul className="viz-rows">
      {data.map((d) => <li key={d.label} title={d.title ?? `${d.label}: ${d.shown ?? d.value}`}>
        <span className="viz-row-label">{d.label}</span>
        <span className="viz-row-track"><span className="viz-row-bar" style={{ width: `${Math.min(100, (d.value / top) * 100)}%`, background: d.color ?? color }} /></span>
        <span className="viz-row-value">{d.shown ?? d.value}</span>
      </li>)}
    </ul> : <p className="viz-empty">{empty}</p>}
  </figure>;
}

/** A donut for parts of a whole (a few parts at most), with a legend naming each and its share. */
export function Donut({ title, data, centre }: { title: string; data: { label: string; value: number; color: string }[]; centre?: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const size = 160, r = 62, stroke = 22, c = 2 * Math.PI * r;
  const shown = data.filter((d) => d.value > 0);
  let offset = 0;
  return <figure className="viz-card">
    <figcaption>{title}</figcaption>
    <div className="viz-donut">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eeeeea" strokeWidth={stroke} />
        {total ? shown.map((d) => {
          const length = (d.value / total) * c;
          // A 2px surface gap between segments when there is more than one.
          const gap = shown.length > 1 ? 2 : 0;
          const segment = <circle key={d.label} className="viz-mark" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, length - gap)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{`${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`}</title>
          </circle>;
          offset += length;
          return segment;
        }) : null}
        <text x={size / 2} y={size / 2 + 2} textAnchor="middle" className="viz-centre">{total}</text>
        <text x={size / 2} y={size / 2 + 20} textAnchor="middle" className="viz-axis">{centre ?? "total"}</text>
      </svg>
      <ul className="viz-legend">
        {data.map((d) => <li key={d.label}>
          <i className="viz-swatch" style={{ background: d.color }} aria-hidden="true" />
          <span>{d.label}</span>
          <strong>{d.value}</strong>
          <small>{total ? `${Math.round((d.value / total) * 100)}%` : "—"}</small>
        </li>)}
      </ul>
    </div>
  </figure>;
}

export type YieldRow = { label: string; stages: number; average?: number; lowest?: number; highest?: number; limit?: YieldRange; tone: YieldTone };

/**
 * Yield per process against QA's limits: QA's range as a band, the lowest to highest stage as a
 * thin line, the average as a dot in its status colour, and the average with its status in words.
 */
export function YieldChart({ title, rows }: { title: string; rows: YieldRow[] }) {
  const values = rows.flatMap((row) => [row.lowest, row.highest, row.limit?.min, row.limit?.max]).filter((value): value is number => value !== undefined);
  const low = Math.max(0, Math.floor((Math.min(90, ...values) - 2) / 5) * 5);
  const high = Math.ceil((Math.max(100, ...values) + 1) / 5) * 5;
  const x = (value: number) => `${((value - low) / (high - low)) * 100}%`;
  const shown = rows.filter((row) => row.stages || row.limit);
  return <figure className="viz-card viz-yield">
    <figcaption>{title}</figcaption>
    {shown.length ? <>
      <ul className="viz-legend viz-legend-inline">
        <li><i className="viz-swatch viz-swatch-band" aria-hidden="true" /><span>QA&apos;s limits</span></li>
        <li><i className="viz-swatch viz-swatch-range" aria-hidden="true" /><span>Lowest to highest</span></li>
        <li><i className="viz-swatch viz-swatch-dot" aria-hidden="true" /><span>Average</span></li>
      </ul>
      <ul className="viz-yield-rows">
        {shown.map((row) => <li key={row.label} title={`${row.label}: ${row.average === undefined ? "no finished stage" : `average ${row.average.toFixed(1)}% of theoretical over ${row.stages} batch${row.stages === 1 ? "" : "es"}, ${row.lowest!.toFixed(1)}–${row.highest!.toFixed(1)}%`}${row.limit ? ` · QA's limits ${limitText(row.limit) || "none"}` : ""}`}>
          <span className="viz-row-label">{row.label}<small>{row.stages} batch{row.stages === 1 ? "" : "es"}{limitText(row.limit) ? ` · limits ${limitText(row.limit)}` : ""}</small></span>
          <span className="viz-yield-track">
            {row.limit && (row.limit.min !== undefined || row.limit.max !== undefined) ? <span className="viz-yield-band" style={{ left: x(row.limit.min ?? low), right: `calc(100% - ${x(row.limit.max ?? high)})` }} /> : null}
            <span className="viz-yield-hundred" style={{ left: x(100) }} />
            {row.lowest !== undefined && row.highest !== undefined && row.highest > row.lowest ? <span className="viz-yield-range" style={{ left: x(row.lowest), right: `calc(100% - ${x(row.highest)})` }} /> : null}
            {row.average !== undefined ? <span className="viz-yield-dot" style={{ left: x(row.average), background: TONE_COLOUR[row.tone] }} /> : null}
          </span>
          <span className="viz-yield-value">{row.average === undefined ? <span className="route-muted">–</span> : <><strong>{row.average.toFixed(1)}%</strong><small>{TONE_LABEL[row.tone]}</small></>}</span>
        </li>)}
      </ul>
      <p className="viz-scale"><span>{low}%</span><span>% of theoretical</span><span>{high}%</span></p>
    </> : <p className="viz-empty">No process with a finished batch or QA limit in this view.</p>}
  </figure>;
}
