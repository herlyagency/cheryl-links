import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  Info,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Table2,
  Clock,
  Map as MapIcon,
  List,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { configured, stats, summaryStats } from "./api";
import { csv, rangeDates, safeUrl, linkThumbnail } from "./model";
import { SocialIcon } from "./social-icons";
import {
  destinations as joinDestinations,
  sourceRows,
  sourceLabel,
  change,
  DIRECT,
} from "./analytics-summary.js";
import { RAMP } from "./map-ramp.js";
const GeoMap = React.lazy(() => import("./GeoMap"));

// Series colours (validated for colour-vision deficiency on the white card surface).
const VIEWS = "#3d4ed6";
const CLICKS = "#d0157a";
const PREVIOUS = "#b9b7b0";
const LIVE_POLL_MS = 30000;
const RANGES = [
  ["Today", "Today"],
  ["Last 7 days", "7 days"],
  ["Last 30 days", "30 days"],
  ["Last 90 days", "90 days"],
];
const DEVICE = { mobile: "Phone", desktop: "Computer", tablet: "Tablet" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const num = (value) =>
  typeof value === "number" ? Math.round(value).toLocaleString() : value;
const pct = (value) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
const ratio = (a, b) => (b ? (a / b) * 100 : null);
const sum = (a) => a.reduce((x, y) => x + y, 0);
function seconds(value) {
  if (value == null) return "—";
  const s = Math.round(value);
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shortDate = (date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
function rangeLabel(range) {
  const from = new Date(range.from),
    to = new Date(Date.parse(range.to) - 1);
  return localDay(from) === localDay(to)
    ? shortDate(from)
    : `${shortDate(from)} – ${shortDate(to)}`;
}
function shortUrl(url) {
  try {
    const u = new URL(safeUrl(url));
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path.length > 24 ? path.slice(0, 23) + "…" : path}`;
  } catch {
    return "";
  }
}
/** The account handle shown under a platform name, e.g. "gymcheryl". */
function handle(url) {
  try {
    const u = new URL(safeUrl(url));
    const last = u.pathname.split("/").filter(Boolean).at(-1) || "";
    return (
      decodeURIComponent(last).replace(/^@/, "") ||
      u.hostname.replace(/^www\./, "")
    );
  } catch {
    return "";
  }
}
const hourLabel = (h) =>
  new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
function regionNamer() {
  try {
    const names = new Intl.DisplayNames(undefined, { type: "region" });
    return (code) => (code ? names.of(code) || code : "Unknown");
  } catch {
    return (code) => code || "Unknown";
  }
}
function languageName(code) {
  try {
    return (
      new Intl.DisplayNames(undefined, { type: "language" }).of(code) || code
    );
  } catch {
    return code;
  }
}

/** Zero-filled report for the local demo (no Supabase), so the layout still renders. */
function emptySummary(range) {
  const hourly = Date.parse(range.to) - Date.parse(range.from) <= 2 * 86400000;
  const series = [];
  const d = new Date(range.from);
  if (hourly) d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  for (let n = 0; d < new Date(range.to) && n < 400; n++) {
    series.push({
      at: `${localDay(d)}T${String(d.getHours()).padStart(2, "0")}:00:00`,
      views: 0,
      clicks: 0,
    });
    if (hourly) d.setHours(d.getHours() + 1);
    else d.setDate(d.getDate() + 1);
  }
  const zero = {
    views: 0,
    clicks: 0,
    shares: 0,
    visitors: 0,
    clickers: 0,
    active_days: 0,
    median_seconds: null,
    avg_scroll: null,
  };
  return {
    unit: hourly ? "hour" : "day",
    totals: zero,
    previous: zero,
    sessions: { count: 0, bounced: 0, median_time_to_click: null },
    returning: 0,
    series,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      current: 0,
      previous: 0,
    })),
    weekdays: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, count: 0 })),
    realtime: Array.from({ length: 30 }, (_, minute) => ({
      minute,
      views: 0,
      clicks: 0,
    })),
    sources: [],
    devices: [],
    os: [],
    apps: [],
    languages: [],
    campaigns: [],
    countries: [],
    cities: [],
    destinations: [],
    dropped: 0,
    demo: true,
  };
}

/* ───────── building blocks ───────── */

function DeltaPill({ value, suffix = "vs last period", points = false }) {
  if (value == null)
    return <span className="an-delta-row muted">No earlier data</span>;
  const dir =
    value === Infinity || value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
  const Icon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }[dir];
  const text =
    value === Infinity
      ? "New"
      : `${Math.abs(value).toFixed(1)}${points ? " pts" : "%"}`;
  return (
    <span className="an-delta-row">
      <span className={`an-delta ${dir}`}>
        <Icon size={13} aria-hidden="true" />
        <span className="an-sr">
          {dir === "down" ? "down " : dir === "up" ? "up " : "unchanged "}
        </span>
        {text}
      </span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

function LivePill({ on, onToggle }) {
  return (
    <button
      className={`an-live${on ? " on" : ""}`}
      onClick={onToggle}
      aria-pressed={on}
      title={
        on ? "Live updates on: refreshing every 30 seconds" : "Live updates off"
      }
    >
      <i aria-hidden="true" />
      Live
    </button>
  );
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(value) {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const unit = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10])
    if (m * unit >= value) return m * unit;
  return 10 * unit;
}
const tickLabel = (t) => (t >= 1000 ? `${+(t / 1000).toFixed(2)}K` : num(t));

function Sparkline({ values, color }) {
  const [ref, width] = useWidth();
  const h = 34;
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (v, i) =>
        `${values.length < 2 ? width / 2 : (i * width) / (values.length - 1)},${h - 3 - (v / max) * (h - 6)}`,
    )
    .join(" ");
  return (
    <div className="an-spark" ref={ref} aria-hidden="true">
      {width > 0 && (
        <svg width={width} height={h}>
          {values.length > 1 ? (
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <line
              x1="0"
              x2={width}
              y1={h - 3}
              y2={h - 3}
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      )}
    </div>
  );
}

/** Multi-series line chart on one shared y-axis, with a crosshair tooltip. */
function LineChart({
  labels,
  longLabels = labels,
  series,
  height = 220,
  label,
  area = true,
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 36, r: 10, t: 12, b: 26 };
  const w = Math.max(0, width - pad.l - pad.r),
    h = height - pad.t - pad.b;
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => pad.t + h - (v / top) * h;
  const ticks = top <= 1 ? [0, 1] : [0, top / 2, top];
  const xTicks =
    n <= 1
      ? [0]
      : [
          ...new Set([
            0,
            Math.round((n - 1) / 3),
            Math.round((2 * (n - 1)) / 3),
            n - 1,
          ]),
        ];
  function move(e) {
    if (!n || !w) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - pad.l) / w) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, n <= 1 ? 0 : i)));
  }
  return (
    <div className="an-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={pad.l + w}
                y1={y(t)}
                y2={y(t)}
                className="an-gridline"
              />
              <text
                x={pad.l - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="an-axis"
              >
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              className="an-axis"
              textAnchor={
                n <= 1
                  ? "middle"
                  : i === 0
                    ? "start"
                    : i === n - 1
                      ? "end"
                      : "middle"
              }
            >
              {labels[i]}
            </text>
          ))}
          {series.map((s, si) => {
            const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.name}>
                {area && si === 0 && !s.dashed && n > 1 && (
                  <polygon
                    points={`${x(0)},${y(0)} ${points} ${x(n - 1)},${y(0)}`}
                    fill={s.color}
                    opacity="0.08"
                  />
                )}
                {n > 1 ? (
                  <polyline
                    points={points}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? "5 5" : undefined}
                  />
                ) : (
                  <circle
                    cx={x(0)}
                    cy={y(s.values[0] || 0)}
                    r="5"
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                )}
              </g>
            );
          })}
          {hover != null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={pad.t + h}
                className="an-crosshair"
              />
              {series.map((s) => (
                <circle
                  key={s.name}
                  cx={x(hover)}
                  cy={y(s.values[hover] || 0)}
                  r="5"
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div
          className="an-tooltip"
          style={{ left: Math.min(Math.max(x(hover), 80), width - 80) }}
        >
          <strong>{longLabels[hover]}</strong>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
              <b>{num(s.values[hover] || 0)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ series }) {
  return (
    <div className="an-legend">
      {series.map((s) => (
        <span key={s.name}>
          <i
            className={s.dashed ? "dashed" : ""}
            style={
              s.dashed ? { borderColor: s.color } : { background: s.color }
            }
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Current vs previous columns per group (one shared axis: all values are counts). */
function GroupedBars({ groups }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = 190,
    pad = { l: 38, b: 26, t: 10 };
  const top = niceMax(
    Math.max(0, ...groups.flatMap((g) => [g.current, g.previous])),
  );
  const h = height - pad.t - pad.b;
  const band = groups.length ? (width - pad.l) / groups.length : 0;
  const bar = Math.min(24, band / 3);
  const y = (v) => pad.t + h - (v / top) * h;
  const column = (x, v, color, key) => {
    const head = y(v),
      base = pad.t + h,
      r = Math.min(4, Math.max(0, base - head));
    return (
      <path
        key={key}
        d={`M${x},${base} V${head + r} Q${x},${head} ${x + r},${head} H${x + bar - r} Q${x + bar},${head} ${x + bar},${head + r} V${base} Z`}
        fill={color}
      />
    );
  };
  return (
    <div className="an-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Current period compared with the previous period"
          onPointerLeave={() => setHover(null)}
        >
          {[0, top / 2, top].map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                className="an-gridline"
              />
              <text
                x={pad.l - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="an-axis"
              >
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {groups.map((g, i) => {
            const cx = pad.l + band * i + band / 2;
            return (
              <g
                key={g.label}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              >
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={band}
                  height={h}
                  fill="transparent"
                />
                {column(cx - bar - 1, g.current, VIEWS, "c")}
                {column(cx + 1, g.previous, PREVIOUS, "p")}
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="an-axis"
                >
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && groups[hover] && (
        <div
          className="an-tooltip"
          style={{
            left: Math.min(
              Math.max(pad.l + band * hover + band / 2, 80),
              width - 80,
            ),
          }}
        >
          <strong>{groups[hover].label}</strong>
          <span>
            <i style={{ background: VIEWS }} />
            Current period<b>{num(groups[hover].current)}</b>
          </span>
          <span>
            <i style={{ background: PREVIOUS }} />
            Previous period<b>{num(groups[hover].previous)}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** Donut of parts with 2px surface gaps and a centred total. */
function Donut({ parts, center, caption }) {
  const total = sum(parts.map((p) => p.value));
  const r = 62,
    stroke = 18,
    c = 2 * Math.PI * r;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="an-donut">
      <svg
        viewBox="0 0 160 160"
        width="160"
        height="160"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${num(p.value)}`).join(", ")}
      >
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#f0eff2"
          strokeWidth={stroke}
        />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.label}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 80 80)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="80" y="80" textAnchor="middle" className="an-donut-value">
          {center}
        </text>
        <text x="80" y="99" textAnchor="middle" className="an-axis">
          {caption}
        </text>
      </svg>
      <ul className="an-donut-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{num(p.value)}</b>
            <small>{pct(ratio(p.value, total))}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SegmentedBar({ parts }) {
  const total = sum(parts.map((p) => p.count));
  if (!total) return null;
  return (
    <div
      className="an-segbar"
      role="img"
      aria-label={parts
        .map((p) => `${p.label} ${pct(ratio(p.count, total))}`)
        .join(", ")}
    >
      {parts.map((p) => (
        <i
          key={p.label}
          style={{ flexGrow: p.count, background: p.color }}
          title={`${p.label}: ${num(p.count)}`}
        />
      ))}
    </div>
  );
}

/** Ranked horizontal bars: label, count and share. */
function Bars({
  rows,
  total,
  unit = "visits",
  limit,
  color = VIEWS,
  format = (k) => k,
}) {
  if (!rows.length)
    return <p className="an-empty-line">Nothing recorded in this period.</p>;
  return (
    <ul className="an-bars">
      {(limit ? rows.slice(0, limit) : rows).map((row) => {
        const share = ratio(row.count, total) || 0;
        return (
          <li key={row.key}>
            <div className="an-bars-label">
              <span>{format(row.key)}</span>
              <span>
                <b>{num(row.count)}</b>{" "}
                {row.count === 1 ? unit.replace(/s$/, "") : unit} · {pct(share)}
              </span>
            </div>
            <div className="an-track">
              <i style={{ width: `${share}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Rounded modal on the native <dialog> (focus trap, Esc to close). */
function Modal({
  open,
  onClose,
  title,
  eyebrow,
  icon,
  children,
  wide = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`an-modal${wide ? " wide" : ""}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="an-modal-title"
    >
      {open && (
        <div className="an-modal-inner">
          <header className="an-modal-head">
            {icon}
            <div>
              {eyebrow && <span className="an-eyebrow">{eyebrow}</span>}
              <h3 id="an-modal-title">{title}</h3>
            </div>
            <button
              className="an-icon-button"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>
          <div className="an-modal-content">{children}</div>
        </div>
      )}
    </dialog>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <section className="an-card">
      <header className="an-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, note, dot, corner, onClick, children }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`an-stat${onClick ? " clickable" : ""}`} onClick={onClick}>
      <span className="an-stat-label">
        {dot && <i style={{ background: dot }} />}
        <span className="an-stat-name">{label}</span>
        {onClick && (
          <Info size={15} aria-hidden="true" className="an-stat-info" />
        )}
      </span>
      {corner != null ? (
        <span className="an-stat-value">
          <strong>{value}</strong>
          <span className="an-stat-corner">{corner}</span>
        </span>
      ) : (
        <strong>{value}</strong>
      )}
      {note != null && <small>{note}</small>}
      {children}
    </Tag>
  );
}

function DestinationIcon({ link, large = false }) {
  return (
    <span className={`an-thumb${large ? " large" : ""}`}>
      <SocialIcon name={link.icon} url={link.url} />
      {link.group === "link" && linkThumbnail(link) && (
        <img
          src={linkThumbnail(link)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

const GROUPS = [
  ["social", "Social networks"],
  ["payment", "Payment"],
  ["live", "Live stream"],
  ["removed", "Removed links"],
];

/* ───────── the dashboard ───────── */

export default function Analytics({
  site,
  notify,
  loadSummary = summaryStats,
  loadEvents = stats,
}) {
  const [filter, setFilter] = useState("Last 7 days"),
    [start, setStart] = useState(localDay(new Date(Date.now() - 6 * 86400000))),
    [end, setEnd] = useState(localDay(new Date())),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState({ n: 0, quiet: false }),
    [live, setLive] = useState(true),
    [modal, setModal] = useState(null),
    [geoView, setGeoView] = useState("map"),
    [geoLevel, setGeoLevel] = useState("countries"),
    [expanded, setExpanded] = useState({});
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [mapRef, mapWidth] = useWidth();

  useEffect(() => {
    let alive = true;
    if (!reload.quiet) setLoading(true);
    setError("");
    (async () => {
      try {
        const range = rangeDates(filter, start, end);
        if (
          !Number.isFinite(Date.parse(range.from)) ||
          Date.parse(range.to) <= Date.parse(range.from) ||
          Date.parse(range.to) - Date.parse(range.from) > 366 * 86400000
        )
          throw Error("Choose a valid date range of at most 366 days.");
        const summary =
          (await loadSummary(range.from, range.to, tz)) || emptySummary(range);
        if (alive) setResult({ summary, range });
      } catch (e) {
        if (alive && !reload.quiet) {
          setResult(null);
          setError(e.message);
          notify(e.message, true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, start, end, reload, loadSummary]);

  // Live: refresh in place every 30 s while the tab is visible.
  useEffect(() => {
    if (!live || !configured) return;
    const id = setInterval(() => {
      if (!document.hidden) setReload((r) => ({ n: r.n + 1, quiet: true }));
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [live]);

  const s = result?.summary;
  const close = () => setModal(null);
  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  async function exportData() {
    try {
      const { from, to } = result.range;
      const report = await loadEvents(from, to);
      const events = report?.events || [];
      if (!events.length)
        return notify("No recorded events in this period.", true);
      const columns = [
        "timestamp",
        "event_type",
        "link_id",
        "source",
        "referrer",
        "medium",
        "campaign",
        "device",
        "os",
        "app",
        "lang",
        "country",
        "city",
        "duration_s",
        "scroll",
        "identity",
        "visitor",
        "session",
      ];
      const content = csv([
        columns,
        ...events.map((e) => columns.map((c) => e[c] ?? "")),
      ]);
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/csv" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "cheryl-analytics.csv";
      a.click();
      URL.revokeObjectURL(url);
      if (report.limited)
        notify(
          "The export includes the first 20,000 events. Choose a shorter range for the rest.",
          true,
        );
    } catch (e) {
      notify(e.message || "Export failed", true);
    }
  }

  const header = (
    <header className="an-header">
      <div className="an-title-row">
        <h2>Overview</h2>
        <div className="an-toolbar-icons">
          <button
            className="an-icon-button"
            disabled={loading}
            onClick={() => setReload((r) => ({ n: r.n + 1, quiet: false }))}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "an-spin" : ""} />
          </button>
          <button
            className="an-icon-button"
            disabled={!s || s.demo}
            onClick={exportData}
            aria-label="Export CSV"
            title="Export recorded events (CSV)"
          >
            <Download size={16} />
          </button>
          <button
            className="an-icon-button"
            onClick={() => setModal({ type: "about" })}
            aria-label="How analytics work"
            title="How analytics work"
          >
            <Info size={16} />
          </button>
        </div>
      </div>
      <div className="an-toolbar">
        <div className="an-segment" role="radiogroup" aria-label="Date range">
          {RANGES.map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={filter === value}
              className={filter === value ? "on" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
          <button
            role="radio"
            aria-checked={filter === "Custom"}
            className={`an-date${filter === "Custom" ? " on" : ""}`}
            onClick={() => setFilter("Custom")}
          >
            <Clock size={14} aria-hidden="true" />
            {result ? rangeLabel(result.range) : "Custom"}
          </button>
        </div>
      </div>
      {filter === "Custom" && (
        <div className="an-custom">
          <label>
            <span>From</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      )}
    </header>
  );

  if (!s)
    return (
      <div className="an">
        {header}
        {error ? (
          <div className="an-notice warn" role="alert">
            {error} Use Refresh to try again.
          </div>
        ) : (
          <div className="an-card an-skeleton" role="status">
            Loading your analytics…
          </div>
        )}
      </div>
    );

  /* ── derived numbers ── */
  const t = s.totals,
    p = s.previous;
  const interactions = t.views + t.clicks,
    pInteractions = p.views + p.clicks;
  const engagement = ratio(t.clicks, t.views),
    pEngagement = ratio(p.clicks, p.views);
  const hourly = s.unit === "hour";
  const at = s.series.map((b) => new Date(b.at));
  const labels = at.map((d) =>
    hourly
      ? d.toLocaleTimeString(undefined, { hour: "numeric" })
      : shortDate(d),
  );
  const longLabels = at.map((d) =>
    hourly
      ? d.toLocaleString(undefined, { weekday: "short", hour: "numeric" })
      : d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
  );
  const viewsSeries = s.series.map((b) => b.views),
    clicksSeries = s.series.map((b) => b.clicks);
  const trend = [
    { name: "Profile views", color: VIEWS, values: viewsSeries },
    { name: "Link clicks", color: CLICKS, values: clicksSeries },
  ];
  const rt = s.realtime || [];
  const rtViews = rt.map((m) => m.views),
    rtClicks = rt.map((m) => m.clicks);
  const rtMax = Math.max(1, ...rt.map((m) => m.views + m.clicks));
  const rtLabels = rt.map((m) =>
    new Date(Date.now() - (30 - m.minute) * 60000).toLocaleTimeString(
      undefined,
      { hour: "numeric", minute: "2-digit" },
    ),
  );
  const sources = sourceRows(s.sources);
  const sourceTotal = sum(sources.map((x) => x.count));
  const dests = joinDestinations(s.destinations, site, t.clicks);
  const cards = dests.filter((d) => d.group === "link");
  const bounce = ratio(s.sessions.bounced, s.sessions.count);
  const geoRows = (geoLevel === "countries" ? s.countries : s.cities) || [];
  const geoTotal = sum(geoRows.map((r) => r.count));
  const region = regionNamer();
  const growth = change(interactions, pInteractions);

  const kpis = [
    {
      id: "views",
      label: "Profile views",
      value: t.views,
      earlier: p.views,
      color: VIEWS,
      spark: viewsSeries,
      help: "Times your page was opened. Every visit counts, including repeat visits by the same person.",
    },
    {
      id: "clicks",
      label: "Link clicks",
      value: t.clicks,
      earlier: p.clicks,
      color: CLICKS,
      spark: clicksSeries,
      help: "Clicks on your link cards, social icons and the live-stream badge. Repeat clicks all count.",
    },
    {
      id: "interactions",
      label: "Total interactions",
      value: interactions,
      earlier: pInteractions,
      color: "#1baf7a",
      spark: viewsSeries.map((v, i) => v + clicksSeries[i]),
      help: "Profile views plus link clicks: everything people did on your page.",
    },
    {
      id: "engagement",
      label: "Engagement rate",
      value: engagement,
      earlier: pEngagement,
      format: pct,
      color: "#eb6834",
      spark: viewsSeries.map((v, i) => (v ? (clicksSeries[i] / v) * 100 : 0)),
      help: `Link clicks ÷ profile views. It can pass 100% when people click several links. ${num(t.clickers)} of ${num(t.visitors)} visitors (${pct(ratio(t.clickers, t.visitors))}) clicked at least one link.`,
    },
  ];
  const kpiDelta = (k) =>
    k.id === "engagement"
      ? k.value == null || k.earlier == null
        ? null
        : k.value - k.earlier
      : change(k.value, k.earlier);
  const openKpi =
    modal?.type === "kpi" ? kpis.find((k) => k.id === modal.id) : null;
  const openLink =
    modal?.type === "link" ? dests.find((d) => d.id === modal.id) : null;
  const isAccount = (d) => d.group === "social" || d.group === "payment";

  const destRow = (d) => (
    <li key={d.id}>
      <button onClick={() => setModal({ type: "link", id: d.id })}>
        <DestinationIcon link={d} />
        <span className="an-dest-name">
          <strong>{isAccount(d) ? d.title.toLowerCase() : d.title}</strong>
          <small>{isAccount(d) ? handle(d.url) : shortUrl(d.url)}</small>
        </span>
        <span className="an-count-pill">
          {num(d.clicks)} {d.clicks === 1 ? "Click" : "Clicks"}
        </span>
        <span className="an-track">
          <i style={{ width: `${d.share}%`, background: VIEWS }} />
        </span>
      </button>
    </li>
  );

  return (
    <div className="an">
      {header}
      {s.demo && !configured && (
        <div className="an-notice">
          Local demo · no sample traffic is shown as real. Connect Supabase to
          see recorded activity.
        </div>
      )}
      {s.dropped > 0 && (
        <div className="an-notice warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" /> {num(s.dropped)}{" "}
          requests were refused by the daily safety cap in this period, so
          counts may be slightly low.
        </div>
      )}
      <div className={`an-stack${loading ? " an-dim" : ""}`}>
        {/* 1 ── Key metrics */}
        <Card
          title="Key metrics"
          subtitle={`Profile activity for ${rangeLabel(result.range)}, compared with the previous period.`}
          action={<LivePill on={live} onToggle={() => setLive((v) => !v)} />}
        >
          <div className="an-tiles four">
            {kpis.map((k) => (
              <Stat
                key={k.id}
                label={k.label}
                value={(k.format || num)(k.value)}
                onClick={() => setModal({ type: "kpi", id: k.id })}
              >
                <DeltaPill value={kpiDelta(k)} points={k.id === "engagement"} />
                <Sparkline values={k.spark} color={k.color} />
              </Stat>
            ))}
          </div>
          <p className="an-fine">
            <Info size={13} aria-hidden="true" /> First-party numbers for
            cherylxxw.com only. They don’t include data from Instagram, TikTok,
            YouTube or other platforms.
          </p>
        </Card>

        {/* 2 ── Traffic overview */}
        <Card
          title="Traffic overview"
          subtitle={`${rangeLabel(result.range)} · ${hourly ? "by hour" : "by day"}`}
          action={
            <div className="an-legend-totals">
              <span>
                <small>
                  <i style={{ background: VIEWS }} />
                  Views
                </small>
                <b>{num(t.views)}</b>
              </span>
              <span>
                <small>
                  <i style={{ background: CLICKS }} />
                  Clicks
                </small>
                <b>{num(t.clicks)}</b>
              </span>
            </div>
          }
        >
          <LineChart
            labels={labels}
            longLabels={longLabels}
            series={trend}
            label={`Profile views and link clicks ${hourly ? "per hour" : "per day"}`}
          />
          <Legend series={trend} />
        </Card>

        {/* 3 ── Real-time */}
        <Card
          title="Real-time activity"
          subtitle="Last 30 minutes"
          action={<LivePill on={live} onToggle={() => setLive((v) => !v)} />}
        >
          <div className="an-tiles three">
            <Stat
              label="Total visits"
              dot={VIEWS}
              value={num(sum(rtViews))}
              note={`${num(rtViews.at(-1) || 0)} / min right now`}
            />
            <Stat
              label="Total clicks"
              dot={CLICKS}
              value={num(sum(rtClicks))}
              note={`${num(rtClicks.at(-1) || 0)} / min right now`}
            />
            <Stat
              label="Total activity"
              dot="#1baf7a"
              value={num(sum(rtViews) + sum(rtClicks))}
              note={`${num((rtViews.at(-1) || 0) + (rtClicks.at(-1) || 0))} / min right now`}
            />
          </div>
          <LineChart
            labels={rtLabels}
            series={[
              { name: "Profile visits", color: VIEWS, values: rtViews },
              { name: "Link clicks", color: CLICKS, values: rtClicks },
            ]}
            height={170}
            area={false}
            label="Visits and clicks per minute over the last 30 minutes"
          />
          <div className="an-minibars" aria-hidden="true">
            {rt.map((m) => {
              const v = m.views + m.clicks;
              return (
                <i
                  key={m.minute}
                  className={v ? "" : "zero"}
                  style={{ height: `${Math.max(14, (v / rtMax) * 100)}%` }}
                />
              );
            })}
          </div>
        </Card>

        {/* 4 ── Traffic sources */}
        <Card
          title="Traffic sources"
          subtitle={rangeLabel(result.range)}
          action={
            <div className="an-head-figure">
              <small>Visits</small>
              <b>{num(sourceTotal)}</b>
            </div>
          }
        >
          <SegmentedBar parts={sources} />
          {sources.length ? (
            <div className="an-tiles two">
              {(expanded.sources ? sources : sources.slice(0, 6)).map((src) => (
                <Stat
                  key={src.label}
                  label={src.label}
                  dot={src.color}
                  value={num(src.count)}
                  note={
                    src.host ||
                    (src.label === DIRECT
                      ? "typed, bookmarked or hidden"
                      : "from the app or a UTM tag")
                  }
                  corner={pct(ratio(src.count, sourceTotal))}
                />
              ))}
            </div>
          ) : (
            <p className="an-empty-line">No visits recorded in this period.</p>
          )}
          {sources.length > 6 && (
            <button className="an-view-all" onClick={() => toggle("sources")}>
              {expanded.sources ? "Show less" : `View all ${sources.length}`}
              <ChevronDown
                size={14}
                className={expanded.sources ? "flip" : ""}
              />
            </button>
          )}
        </Card>

        {/* 5 ── Visitor behaviour */}
        <Card
          title="Visitor behaviour"
          subtitle="How people use your page once they arrive"
        >
          <div className="an-tiles four">
            <Stat label="Visitors ≈" value={num(t.visitors)}>
              <DeltaPill value={change(t.visitors, p.visitors)} />
            </Stat>
            <Stat
              label="Bounce rate"
              value={pct(bounce)}
              note="left without clicking a link"
            />
            <Stat
              label="Time on page"
              value={seconds(t.median_seconds)}
              note="median, while on screen"
            />
            <Stat
              label="Time to first click"
              value={seconds(s.sessions.median_time_to_click)}
              note="median, for visits that clicked"
            />
            <Stat
              label="Scroll depth"
              value={
                t.avg_scroll == null ? "—" : `${Math.round(t.avg_scroll)}%`
              }
              note="average share of page seen"
            />
            <Stat
              label="Shares"
              value={num(t.shares)}
              note="share button taps"
            />
            <Stat
              label="Returning visitors"
              value={num(s.returning)}
              note="from visitors who chose “remember”"
            />
            <Stat
              label="Sessions"
              value={num(s.sessions.count)}
              note="verified page opens"
            />
          </div>
        </Card>

        {/* 6 ── Period comparison */}
        <Card
          title="Period comparison"
          subtitle="Current period against the one before it"
        >
          <div className="an-tiles three">
            {[
              ["Profile visits", t.views, p.views, VIEWS],
              ["Link clicks", t.clicks, p.clicks, CLICKS],
              ["Total activity", interactions, pInteractions, "#1baf7a"],
            ].map(([label, cur, prev, color]) => (
              <Stat key={label} label={label} dot={color} value={num(cur)}>
                <span className="an-delta-row">
                  <DeltaPill value={change(cur, prev)} suffix="" />
                  <span>Previous {num(prev)}</span>
                </span>
              </Stat>
            ))}
          </div>
          <div className="an-split">
            <div className="an-panel">
              <h4 className="an-subhead">Comparison overview</h4>
              <GroupedBars
                groups={[
                  { label: "Visits", current: t.views, previous: p.views },
                  { label: "Clicks", current: t.clicks, previous: p.clicks },
                  {
                    label: "Total",
                    current: interactions,
                    previous: pInteractions,
                  },
                ]}
              />
              <Legend
                series={[
                  { name: "Current period", color: VIEWS },
                  { name: "Previous period", color: PREVIOUS },
                ]}
              />
            </div>
            <div className="an-panel">
              <h4 className="an-subhead">Activity distribution</h4>
              <Donut
                parts={[
                  { label: "Profile views", value: t.views, color: VIEWS },
                  { label: "Link clicks", value: t.clicks, color: CLICKS },
                ]}
                center={num(interactions)}
                caption="interactions"
              />
            </div>
          </div>
          <div className="an-panel">
            <h4 className="an-subhead">Activity by hour of day</h4>
            <LineChart
              labels={s.hours.map((h) => hourLabel(h.hour))}
              series={[
                {
                  name: "Current period",
                  color: VIEWS,
                  values: s.hours.map((h) => h.current),
                },
                {
                  name: "Previous period",
                  color: PREVIOUS,
                  values: s.hours.map((h) => h.previous),
                  dashed: true,
                },
              ]}
              height={180}
              area={false}
              label="Views and clicks by hour of day, current versus previous period"
            />
            <Legend
              series={[
                { name: "Current period", color: VIEWS },
                { name: "Previous period", color: PREVIOUS, dashed: true },
              ]}
            />
          </div>
          <div className="an-tiles three">
            <Stat
              label="Active days"
              value={num(t.active_days)}
              note={
                hourly
                  ? "in this period"
                  : `of ${num(s.series.length)} in this period`
              }
            />
            <Stat
              label="Daily average"
              value={num(t.active_days ? interactions / t.active_days : 0)}
              note="interactions per active day"
            />
            <Stat
              label="Overall growth"
              value={
                growth == null
                  ? "—"
                  : growth === Infinity
                    ? "New"
                    : `${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`
              }
              note="vs previous period"
            >
              {growth != null && growth !== Infinity && (
                <span className={`an-growth ${growth < 0 ? "down" : "up"}`} />
              )}
            </Stat>
          </div>
        </Card>

        {/* 7 ── Geography */}
        <Card
          title="Geographic analytics"
          subtitle={`${num(geoRows.length)} locations · ${num(geoTotal)} events`}
        >
          <div className="an-toggles">
            <div className="an-segment small">
              <button
                className={geoView === "map" ? "on" : ""}
                onClick={() => setGeoView("map")}
                aria-pressed={geoView === "map"}
              >
                <MapIcon size={14} aria-hidden="true" /> Map
              </button>
              <button
                className={geoView === "list" ? "on" : ""}
                onClick={() => setGeoView("list")}
                aria-pressed={geoView === "list"}
              >
                <List size={14} aria-hidden="true" /> Breakdown
              </button>
            </div>
            <div className="an-segment small">
              <button
                className={geoLevel === "countries" ? "on" : ""}
                onClick={() => setGeoLevel("countries")}
                aria-pressed={geoLevel === "countries"}
              >
                Countries
              </button>
              <button
                className={geoLevel === "cities" ? "on" : ""}
                onClick={() => setGeoLevel("cities")}
                aria-pressed={geoLevel === "cities"}
              >
                Cities
              </button>
            </div>
          </div>
          {!geoRows.length ? (
            <p className="an-empty-line">
              {geoLevel === "cities"
                ? "City data appears once the optional location proxy is set up (see “How these numbers work”)."
                : "No location data in this period yet. Locations are recorded for new visits."}
            </p>
          ) : (
            <>
              <div className="an-tiles two">
                {geoRows.slice(0, geoView === "list" ? 50 : 6).map((r, i) => (
                  <Stat
                    key={`${r.key}-${r.country || ""}`}
                    label={<span className="an-rank-chip">#{i + 1}</span>}
                    value={num(r.count)}
                    note={
                      geoLevel === "countries"
                        ? region(r.key)
                        : `${r.key}, ${region(r.country)}`
                    }
                  >
                    <span className="an-track">
                      <i
                        style={{
                          width: `${ratio(r.count, geoRows[0].count)}%`,
                          background: VIEWS,
                        }}
                      />
                    </span>
                  </Stat>
                ))}
              </div>
              {geoView === "map" && geoLevel === "countries" && (
                <div ref={mapRef} className="an-map-wrap">
                  <React.Suspense
                    fallback={<div className="an-map-skeleton" />}
                  >
                    <GeoMap rows={s.countries} width={mapWidth} />
                  </React.Suspense>
                  <div className="an-intensity">
                    <small>Activity intensity</small>
                    <div>
                      <span>Low</span>
                      <span className="an-ramp">
                        {RAMP.map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </span>
                      <span>High</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* 8 ── Audience */}
        <Card
          title="Audience"
          subtitle="Devices, apps and languages of your visitors"
        >
          <div className="an-split four">
            <div className="an-panel">
              <h4 className="an-subhead">Devices</h4>
              <Bars
                rows={s.devices}
                total={t.views}
                format={(k) => DEVICE[k] || "Unavailable"}
              />
            </div>
            <div className="an-panel">
              <h4 className="an-subhead">Operating systems</h4>
              <Bars rows={s.os} total={t.views} limit={5} />
            </div>
            <div className="an-panel">
              <h4 className="an-subhead">Apps & browsers</h4>
              <Bars rows={s.apps} total={t.views} limit={5} />
            </div>
            <div className="an-panel">
              <h4 className="an-subhead">Languages</h4>
              <Bars
                rows={s.languages}
                total={t.views}
                limit={5}
                format={languageName}
              />
            </div>
          </div>
          <div className="an-panel">
            <h4 className="an-subhead">Busiest days</h4>
            <Bars
              rows={s.weekdays.map((d) => ({
                key: WEEKDAYS[d.day - 1],
                count: d.count,
              }))}
              total={sum(s.weekdays.map((d) => d.count))}
              unit="interactions"
              color={CLICKS}
            />
          </div>
          {s.campaigns.length > 0 && (
            <div className="an-panel">
              <h4 className="an-subhead">Campaigns (UTM tags)</h4>
              <div className="an-table-wrap">
                <table className="an-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Medium</th>
                      <th>Source</th>
                      <th>Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.campaigns.map((c, i) => (
                      <tr key={i}>
                        <td>{c.campaign || "—"}</td>
                        <td>{c.medium || "—"}</td>
                        <td>{sourceLabel(c.source)}</td>
                        <td>{num(c.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        {/* 9 ── Top web links */}
        <Card
          title="Top web links"
          subtitle="Your most-clicked links in this period"
        >
          {GROUPS.map(([group, name]) => {
            const rows = dests.filter((d) => d.group === group);
            if (!rows.length) return null;
            const open = expanded[group] || rows.length <= 3;
            return (
              <div key={group} className="an-link-group">
                <h4 className="an-group-label">{name}</h4>
                <ul className="an-dest-list">
                  {(open ? rows : rows.slice(0, 3)).map(destRow)}
                </ul>
                {rows.length > 3 && (
                  <button
                    className="an-view-all dark"
                    onClick={() => toggle(group)}
                  >
                    {open ? "Show less" : "View all"}
                    <ChevronDown size={14} className={open ? "flip" : ""} />
                  </button>
                )}
              </div>
            );
          })}
        </Card>

        {/* 10 ── Link cards */}
        {cards.length > 0 && (
          <Card title="Other links" subtitle="Clicks on your link cards">
            <div className="an-gallery">
              {cards.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setModal({ type: "link", id: d.id })}
                  className="an-gallery-item"
                >
                  {linkThumbnail(d) ? (
                    <img
                      src={linkThumbnail(d)}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="an-gallery-icon">
                      <SocialIcon name={d.icon} url={d.url} />
                    </span>
                  )}
                  <span className="an-gallery-badge">
                    {num(d.clicks)} {d.clicks === 1 ? "Click" : "Clicks"}
                  </span>
                  <span className="an-gallery-title">{d.title}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="an-footer">
          <button
            className="an-pill-button"
            onClick={() => setModal({ type: "table" })}
          >
            <Table2 size={15} /> {hourly ? "Hourly" : "Daily"} table
          </button>
          <button
            className="an-pill-button"
            onClick={exportData}
            disabled={s.demo}
          >
            <Download size={15} /> Export CSV
          </button>
          <p>
            {live
              ? "Data refreshes every 30 seconds while Live is on."
              : "Live updates are off."}{" "}
            Records are kept for 90 days.
          </p>
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        open={Boolean(openKpi)}
        onClose={close}
        eyebrow="Key metric"
        title={openKpi?.label}
      >
        {openKpi && (
          <>
            <div className="an-tiles two">
              <Stat
                label="This period"
                value={(openKpi.format || num)(openKpi.value)}
                note={rangeLabel(result.range)}
              />
              <Stat
                label="Previous period"
                value={
                  openKpi.earlier == null
                    ? "—"
                    : (openKpi.format || num)(openKpi.earlier)
                }
                note="same length, just before"
              />
            </div>
            <h4 className="an-subhead">Over time</h4>
            <LineChart
              labels={labels}
              longLabels={longLabels}
              series={[
                {
                  name: openKpi.label,
                  color: openKpi.color,
                  values: openKpi.spark,
                },
              ]}
              height={170}
              label={`${openKpi.label} over time`}
            />
            <p className="an-modal-text">{openKpi.help}</p>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(openLink)}
        onClose={close}
        wide
        eyebrow={openLink?.kind}
        title={
          openLink &&
          (isAccount(openLink)
            ? `${openLink.title} · ${handle(openLink.url)}`
            : openLink.title)
        }
        icon={openLink && <DestinationIcon link={openLink} large />}
      >
        {openLink && (
          <>
            {openLink.url && (
              <a
                className="an-url"
                href={safeUrl(openLink.url)}
                target="_blank"
                rel="noreferrer"
              >
                {shortUrl(openLink.url)} <ArrowUpRight size={13} />
              </a>
            )}
            <div className="an-tiles three">
              <Stat label="Clicks" value={num(openLink.clicks)} />
              <Stat label="People ≈" value={num(openLink.unique)} />
              <Stat label="Share of clicks" value={pct(openLink.share)} />
            </div>
            {openLink.clicks > 0 ? (
              <>
                <h4 className="an-subhead">Clicks over time</h4>
                <LineChart
                  labels={labels}
                  longLabels={longLabels}
                  series={[
                    { name: "Clicks", color: CLICKS, values: openLink.series },
                  ]}
                  height={170}
                  label={`Clicks on ${openLink.title} over time`}
                />
                <div className="an-split">
                  <div>
                    <h4 className="an-subhead">
                      Where these clickers came from
                    </h4>
                    <Bars
                      rows={sourceRows(openLink.sources).map((r) => ({
                        key: r.label,
                        count: r.count,
                      }))}
                      total={openLink.clicks}
                      unit="clicks"
                      color={CLICKS}
                    />
                  </div>
                  <div>
                    <h4 className="an-subhead">Devices</h4>
                    <Bars
                      rows={openLink.devices}
                      total={openLink.clicks}
                      unit="clicks"
                      color={CLICKS}
                      format={(k) => DEVICE[k] || "Unavailable"}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="an-empty-line">
                No clicks on this destination in the selected period.
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={modal?.type === "table"}
        onClose={close}
        eyebrow={rangeLabel(result.range)}
        title={hourly ? "Hourly activity" : "Daily activity"}
      >
        <div className="an-table-wrap">
          <table className="an-table">
            <thead>
              <tr>
                <th>{hourly ? "Hour" : "Date"}</th>
                <th>Views</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {s.series.map((b, i) => (
                <tr key={b.at}>
                  <td>{longLabels[i]}</td>
                  <td>{num(b.views)}</td>
                  <td>{num(b.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={modal?.type === "about"}
        onClose={close}
        eyebrow="Privacy-first analytics"
        title="How these numbers work"
      >
        <ul className="an-about">
          <li>
            <b>Every visit is counted, without cookies.</b> Nothing is stored in
            the visitor’s browser. The server makes an anonymous ID from the
            visitor’s network and browser that only lasts one day and can’t be
            turned back into an IP address. Browsers with Do Not Track or Global
            Privacy Control are never counted.
          </li>
          <li>
            <b>Visitors are approximate (≈).</b> Because the ID resets daily,
            the same person on two days or two devices counts more than once.
            Visitors who tap “Remember this device” at the bottom of your page
            are recognised across days, and only they can show up as returning
            visitors.
          </li>
          <li>
            <b>Sources</b> come from UTM tags first, then the referring website,
            then the app the visitor browses in (for example Instagram’s in-app
            browser). Tag your bio links (?utm_source=instagram) for the most
            reliable attribution.
          </li>
          <li>
            <b>Time on page and scroll depth</b> only count while your page is
            on screen.
          </li>
          <li>
            <b>Location</b> comes from Cloudflare’s country lookup of the
            network address. Cities need the optional location proxy described
            in the README. Location is never guessed from language or time zone.
          </li>
          <li>
            <b>Bots</b> are filtered by Cloudflare Turnstile before a visit is
            recorded. Comparisons use the previous period of the same length.
            Records are kept for 90 days.
          </li>
        </ul>
      </Modal>
    </div>
  );
}
