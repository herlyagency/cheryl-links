import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  Info,
  X,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Table2,
} from "lucide-react";
import { configured, stats } from "./api";
import { csv, rangeDates, safeUrl, linkThumbnail } from "./model";
import { SocialIcon } from "./social-icons";
import {
  summarize,
  breakdown,
  sourceLabel,
  previousRange,
} from "./analytics-summary.js";

// Series colours (validated for colour-vision deficiency against the white card surface).
const VISITS = "#c2502f";
const CLICKS = "#1d7fb0";
const RANGES = [
  ["Today", "Today"],
  ["Yesterday", "Yesterday"],
  ["Last 7 days", "7 days", "7D"],
  ["Last 30 days", "30 days", "30D"],
  ["Last 90 days", "90 days", "90D"],
  ["Custom", "Custom"],
];
const DEVICE = { mobile: "Phone", desktop: "Computer", tablet: "Tablet" };
const deviceLabel = (value) => DEVICE[value] || "Unavailable";

const pct = (value) => (value == null ? "—" : `${value.toFixed(1)}%`);
/** "instagram.com/gymcheryl" — tells apart two destinations with the same name. */
function shortUrl(url) {
  try {
    const u = new URL(safeUrl(url));
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path.length > 24 ? path.slice(0, 23) + "…" : path}`;
  } catch {
    return "";
  }
}
const num = (value) =>
  typeof value === "number" ? value.toLocaleString() : value;
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function dateLabel(value, withTime = true) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime && { hour: "numeric", minute: "2-digit" }),
  });
}
function rangeLabel(range) {
  const to = new Date(Date.parse(range.to) - 1);
  const from = new Date(range.from);
  return localDay(from) === localDay(to)
    ? dateLabel(from, false)
    : `${dateLabel(from, false)} – ${dateLabel(to, false)}`;
}

/** Change versus the preceding, equally long period. */
function delta(current, previous) {
  if (previous == null) return null;
  if (!previous)
    return current
      ? { dir: "up", text: "New", title: "No activity in the earlier period" }
      : { dir: "flat", text: "0%", title: "No change" };
  const change = ((current - previous) / previous) * 100;
  return {
    dir: change > 0.05 ? "up" : change < -0.05 ? "down" : "flat",
    text: `${change > 0 ? "+" : ""}${change.toFixed(change % 1 && Math.abs(change) < 10 ? 1 : 0)}%`,
    title: `${num(previous)} in the earlier period`,
  };
}
function Delta({ value }) {
  if (!value) return null;
  const Icon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }[
    value.dir
  ];
  return (
    <span className={`an-delta ${value.dir}`} title={value.title}>
      <Icon size={13} aria-hidden="true" />
      {value.text}
      <span className="an-sr"> versus earlier period</span>
    </span>
  );
}

/** Time buckets: hourly for ranges up to two days, daily otherwise. */
function timeline(range, seriesEvents) {
  const from = Date.parse(range.from),
    to = Date.parse(range.to);
  const hourly = to - from <= 2 * 86400000;
  const buckets = [];
  if (hourly) {
    for (let t = from; t < to && buckets.length < 48; t += 3600000)
      buckets.push({
        key: t,
        label: new Date(t).toLocaleTimeString(undefined, { hour: "numeric" }),
        long: new Date(t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
        }),
      });
  } else {
    const date = new Date(from);
    for (
      let n = 0;
      date < new Date(to) && n < 366;
      n++, date.setDate(date.getDate() + 1)
    )
      buckets.push({
        key: localDay(date),
        label: dateLabel(date, false),
        long: date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const keyOf = (ts) =>
    hourly
      ? from + Math.floor((Date.parse(ts) - from) / 3600000) * 3600000
      : localDay(new Date(ts));
  const values = seriesEvents.map((events) => {
    const out = buckets.map(() => 0);
    for (const e of events) {
      const i = index.get(keyOf(e.timestamp));
      if (i != null) out[i]++;
    }
    return out;
  });
  return { buckets, values, hourly };
}

function niceMax(value) {
  if (value <= 4) return Math.max(1, value);
  const step = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
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

/** Line/area chart with a crosshair tooltip. One shared y-axis (all series are counts). */
function TrendChart({ buckets, series, height = 220, label }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 34, r: 12, t: 14, b: 28 };
  const w = Math.max(0, width - pad.l - pad.r),
    h = height - pad.t - pad.b;
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = buckets.length;
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => pad.t + h - (v / top) * h;
  const ticks = top <= 1 ? [0, 1] : [0, top / 2, top];
  const xLabels =
    n <= 1 ? [0] : [...new Set([0, Math.round((n - 1) / 2), n - 1])];
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
                {num(Math.round(t))}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 8}
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
              {buckets[i]?.label}
            </text>
          ))}
          {series.map((s, si) => {
            const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.name}>
                {si === 0 && n > 1 && (
                  <polygon
                    points={`${x(0)},${y(0)} ${points} ${x(n - 1)},${y(0)}`}
                    fill={s.color}
                    opacity="0.1"
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
                  cy={y(s.values[hover])}
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
          style={{
            left: Math.min(Math.max(x(hover), 70), width - 70),
          }}
        >
          <strong>{buckets[hover].long}</strong>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
              <b>{num(s.values[hover])}</b>
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
          <i style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Ranked horizontal bars: label, count and share. */
function Bars({ rows, total, unit = "visits", limit, color = VISITS }) {
  if (!rows.length)
    return <p className="an-empty-line">Nothing recorded in this period.</p>;
  return (
    <ul className="an-bars">
      {(limit ? rows.slice(0, limit) : rows).map(([label, count]) => {
        const share = total ? (count / total) * 100 : 0;
        return (
          <li key={label}>
            <div className="an-bars-label">
              <span>{label}</span>
              <span>
                <b>{num(count)}</b>{" "}
                {count === 1 ? unit.replace(/s$/, "") : unit} · {pct(share)}
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

/** Rounded modal dialog built on the native <dialog> (focus trap, Esc to close). */
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

function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`an-card ${className}`}>
      {(title || action) && (
        <header className="an-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

function DestinationIcon({ link }) {
  return (
    <span className="an-thumb">
      <SocialIcon name={link.icon} url={link.url} />
      {link.kind === "Link card" && linkThumbnail(link) && (
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

export default function Analytics({ site, notify, loadStats = stats }) {
  const [filter, setFilter] = useState("Last 7 days"),
    [start, setStart] = useState(localDay(new Date(Date.now() - 6 * 86400000))),
    [end, setEnd] = useState(localDay(new Date())),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [sort, setSort] = useState("clicks"),
    [kind, setKind] = useState("all"),
    [modal, setModal] = useState(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
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
        const earlier = previousRange(range.from, range.to);
        const retained = Date.parse(earlier.from) >= Date.now() - 90 * 86400000;
        const [report, previous] = await Promise.all([
          loadStats(range.from, range.to),
          retained
            ? loadStats(earlier.from, earlier.to).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (alive) setResult({ report, previous, range, earlier });
      } catch (e) {
        if (alive) {
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
  }, [filter, start, end, refresh, loadStats]);

  const events = result?.report.events || [],
    summary = summarize(events, site),
    previous =
      result?.previous && !result.previous.limited && !result.report.limited
        ? summarize(result.previous.events || [], site)
        : null;
  const kinds = [...new Set(summary.ranked.map((link) => link.kind))];
  const ranked = summary.ranked
    .filter((link) => kind === "all" || link.kind === kind)
    .sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b[sort] - a[sort],
    );
  const trend = result
    ? timeline(result.range, [summary.views, summary.clicks])
    : null;
  const trendSeries = trend
    ? [
        { name: "Visits", color: VISITS, values: trend.values[0] },
        { name: "Link clicks", color: CLICKS, values: trend.values[1] },
      ]
    : [];
  const sources = breakdown(summary.views, "source", sourceLabel);
  const devices = breakdown(summary.views, "device", deviceLabel);
  const countries = summary.views.some((event) => event.country)
    ? breakdown(summary.views, "country")
    : [];
  const prevEngagement = previous?.engagement;

  const kpis = [
    {
      id: "visitors",
      label: "Visitors ≈",
      value: summary.visitors,
      earlier: previous?.visitors,
      help: "Different anonymous browser IDs that opened your page. One person on two devices counts twice.",
    },
    {
      id: "clicks",
      label: "Link clicks",
      value: summary.clicks.length,
      earlier: previous?.clicks.length,
      help: "Every click on a link card or social icon. Repeat clicks from the same visitor all count.",
    },
    {
      id: "rate",
      label: "Click rate",
      value: pct(summary.engagement),
      raw: summary.engagement,
      earlier: prevEngagement,
      help: `${num(summary.engaged)} of ${num(summary.visitors)} visitors clicked at least one destination.`,
    },
    {
      id: "returning",
      label: "Returning ≈",
      value: summary.returning,
      earlier: previous?.returning,
      help: "Browser IDs that had visited before this period (within the 90 days of retained records). Cleared storage or another device looks like a new visitor.",
    },
  ];
  const kpiDelta = (k) =>
    k.id === "rate"
      ? k.earlier == null || k.raw == null
        ? null
        : {
            dir:
              k.raw - k.earlier > 0.05
                ? "up"
                : k.raw - k.earlier < -0.05
                  ? "down"
                  : "flat",
            text: `${k.raw - k.earlier > 0 ? "+" : ""}${(k.raw - k.earlier).toFixed(1)} pts`,
            title: `${pct(k.earlier)} in the earlier period`,
          }
      : delta(k.value, k.earlier);

  function exportData() {
    const content = csv([
      [
        "timestamp",
        "event_type",
        "link_title",
        "link_id",
        "source",
        "medium",
        "campaign",
        "device",
        "country",
        "anonymous_id",
      ],
      ...events.map((event) => [
        event.timestamp,
        event.event_type,
        summary.ranked.find((link) => link.id === event.link_id)?.title || "",
        event.link_id,
        event.source,
        event.medium,
        event.campaign,
        event.device,
        event.country,
        event.visitor,
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cheryl-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const close = () => setModal(null);
  const openLink =
    modal?.type === "link"
      ? summary.ranked.find((l) => l.id === modal.id)
      : null;
  const openKpi =
    modal?.type === "kpi" ? kpis.find((k) => k.id === modal.id) : null;
  const linkTrend =
    openLink && result ? timeline(result.range, [openLink.events]) : null;

  return (
    <div className="an">
      {/* ── Level 0: title + controls ─────────────────────────── */}
      <header className="an-header">
        <div>
          <h2>Analytics</h2>
          <p>
            {result
              ? `${rangeLabel(result.range)} · your local time`
              : "What brings people here and where they go next"}
          </p>
        </div>
        <div className="an-toolbar">
          <div className="an-segment" role="radiogroup" aria-label="Date range">
            {RANGES.map(([value, label, tiny]) => (
              <button
                key={value}
                role="radio"
                aria-checked={filter === value}
                className={filter === value ? "on" : ""}
                onClick={() => setFilter(value)}
                aria-label={value}
              >
                {tiny ? (
                  <>
                    <span className="an-long">{label}</span>
                    <span className="an-tiny">{tiny}</span>
                  </>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>
          <div className="an-toolbar-icons">
            <button
              className="an-icon-button"
              disabled={loading}
              onClick={() => setRefresh((n) => n + 1)}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "an-spin" : ""} />
            </button>
            <button
              className="an-icon-button"
              disabled={!events.length}
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
      </header>

      {filter === "Custom" && (
        <div className="an-custom">
          <label>
            <span>From</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      )}

      {!configured && (
        <div className="an-notice">
          Local demo · no sample traffic is presented as real. Connect Supabase
          to see recorded activity.
        </div>
      )}
      {error && !loading && (
        <div className="an-notice warn" role="alert">
          {error} Use Refresh to try again.
        </div>
      )}
      {result?.report.limited && (
        <div className="an-notice warn" role="alert">
          This period has more than 20,000 events, so counts are incomplete and
          comparisons are hidden. Choose a shorter range.
        </div>
      )}

      {loading && !result ? (
        <div className="an-card an-skeleton" role="status">
          Loading your analytics…
        </div>
      ) : (
        result && (
          <div className={`an-stack${loading ? " an-dim" : ""}`}>
            {/* ── Level 1: the headline ─────────────────────────── */}
            <section className="an-card an-hero">
              <div className="an-hero-top">
                <div className="an-hero-main">
                  <span className="an-eyebrow">Visits</span>
                  <div className="an-hero-number">
                    <strong>{num(summary.views.length)}</strong>
                    <Delta
                      value={delta(
                        summary.views.length,
                        previous?.views.length,
                      )}
                    />
                  </div>
                  <p>
                    Page opens in this period, including repeat visits
                    {previous ? ` · vs ${rangeLabel(result.earlier)}` : ""}
                  </p>
                </div>
                <div className="an-kpis">
                  {kpis.map((k) => (
                    <button
                      key={k.id}
                      className="an-kpi"
                      onClick={() => setModal({ type: "kpi", id: k.id })}
                    >
                      <span>
                        {k.label}
                        <Info size={12} aria-hidden="true" />
                      </span>
                      <strong>{num(k.value)}</strong>
                      <Delta value={kpiDelta(k)} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="an-hero-chart">
                <div className="an-chart-head">
                  <span>{trend.hourly ? "By hour" : "By day"}</span>
                  <Legend series={trendSeries} />
                </div>
                <TrendChart
                  buckets={trend.buckets}
                  series={trendSeries}
                  label={`Visits and link clicks ${trend.hourly ? "per hour" : "per day"}`}
                />
                {!events.length && (
                  <p className="an-empty-overlay">
                    No recorded visits yet. Visits appear once someone allows
                    analytics on your page.
                  </p>
                )}
              </div>
            </section>

            {/* ── Level 2: where people go ─────────────────────── */}
            <Card
              title="Top destinations"
              subtitle="Which of your links and icons get clicked. Tap one for details."
              action={
                <select
                  className="an-select"
                  aria-label="Sort destinations"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="clicks">Most clicks</option>
                  <option value="unique">Most people</option>
                  <option value="title">Name</option>
                </select>
              }
            >
              {kinds.length > 1 && (
                <div
                  className="an-chips"
                  role="radiogroup"
                  aria-label="Destination type"
                >
                  {["all", ...kinds].map((value) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={kind === value}
                      className={kind === value ? "on" : ""}
                      onClick={() => setKind(value)}
                    >
                      {value === "all" ? "All" : `${value}s`}
                    </button>
                  ))}
                </div>
              )}
              <ol className="an-destinations">
                {ranked.map((link, index) => (
                  <li key={link.id}>
                    <button
                      onClick={() => setModal({ type: "link", id: link.id })}
                    >
                      <span className="an-rank">{index + 1}</span>
                      <DestinationIcon link={link} />
                      <span className="an-dest-name">
                        <strong>{link.title}</strong>
                        <small>
                          {link.kind}
                          {shortUrl(link.url) && ` · ${shortUrl(link.url)}`}
                        </small>
                        <span className="an-track">
                          <i
                            style={{
                              width: `${link.share}%`,
                              background: CLICKS,
                            }}
                          />
                        </span>
                      </span>
                      <span className="an-dest-value">
                        <strong>{num(link.clicks)}</strong>
                        <small>{pct(link.share)}</small>
                      </span>
                      <ChevronRight
                        size={16}
                        className="an-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ol>
              {!ranked.length && (
                <p className="an-empty-line">
                  No destinations in this category.
                </p>
              )}
            </Card>

            {/* ── Level 3: who visits ──────────────────────────── */}
            <div className="an-grid">
              <Card
                title="Traffic sources"
                subtitle="How people reached your page"
                action={
                  sources.length > 5 && (
                    <button
                      className="an-link-button"
                      onClick={() => setModal({ type: "sources" })}
                    >
                      See all
                    </button>
                  )
                }
              >
                <Bars rows={sources} total={summary.views.length} limit={5} />
              </Card>
              <Card title="Devices" subtitle="What visitors open your page on">
                <Bars rows={devices} total={summary.views.length} />
                {countries.length > 0 && (
                  <>
                    <h4 className="an-subhead">Countries</h4>
                    <Bars
                      rows={countries}
                      total={summary.views.length}
                      limit={5}
                    />
                  </>
                )}
              </Card>
            </div>

            {/* ── Level 4: raw data ────────────────────────────── */}
            <div className="an-footer">
              <button
                className="an-pill-button"
                onClick={() => setModal({ type: "table" })}
                disabled={!trend.buckets.length}
              >
                <Table2 size={15} /> {trend.hourly ? "Hourly" : "Daily"} table
              </button>
              <button
                className="an-pill-button"
                onClick={exportData}
                disabled={!events.length}
              >
                <Download size={15} /> Export CSV
              </button>
              <p>
                Only consented, verified activity is recorded, so these numbers
                won’t include every visitor. Records are kept for 90 days.
              </p>
            </div>
          </div>
        )
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      <Modal
        open={Boolean(openLink)}
        onClose={close}
        wide
        eyebrow={openLink?.kind}
        title={openLink?.title}
        icon={openLink && <DestinationIcon link={openLink} />}
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
                {safeUrl(openLink.url)} <ArrowUpRight size={13} />
              </a>
            )}
            <div className="an-tiles">
              <div>
                <span>Clicks</span>
                <strong>{num(openLink.clicks)}</strong>
              </div>
              <div>
                <span>People ≈</span>
                <strong>{num(openLink.unique)}</strong>
              </div>
              <div>
                <span>Share of clicks</span>
                <strong>{pct(openLink.share)}</strong>
              </div>
            </div>
            {openLink.clicks > 0 ? (
              <>
                <h4 className="an-subhead">Clicks over time</h4>
                <TrendChart
                  buckets={linkTrend.buckets}
                  series={[
                    {
                      name: "Clicks",
                      color: CLICKS,
                      values: linkTrend.values[0],
                    },
                  ]}
                  height={170}
                  label={`Clicks on ${openLink.title} over time`}
                />
                <div className="an-grid tight">
                  <div>
                    <h4 className="an-subhead">
                      Where these clickers came from
                    </h4>
                    <Bars
                      rows={breakdown(openLink.events, "source", sourceLabel)}
                      total={openLink.clicks}
                      unit="clicks"
                      color={CLICKS}
                    />
                  </div>
                  <div>
                    <h4 className="an-subhead">Devices</h4>
                    <Bars
                      rows={breakdown(openLink.events, "device", deviceLabel)}
                      total={openLink.clicks}
                      unit="clicks"
                      color={CLICKS}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="an-empty-line">
                No clicks on this destination in the selected period.
              </p>
            )}
            <p className="an-fine">
              Share of clicks = this destination’s clicks ÷ all recorded clicks.
              A click shows interest; it doesn’t confirm a purchase or follow.
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(openKpi)}
        onClose={close}
        eyebrow="Metric"
        title={openKpi?.label.replace(" ≈", "")}
      >
        {openKpi && (
          <>
            <div className="an-tiles two">
              <div>
                <span>This period</span>
                <strong>{num(openKpi.value)}</strong>
                <small>{rangeLabel(result.range)}</small>
              </div>
              <div>
                <span>Earlier period</span>
                <strong>
                  {openKpi.earlier == null
                    ? "—"
                    : openKpi.id === "rate"
                      ? pct(openKpi.earlier)
                      : num(openKpi.earlier)}
                </strong>
                <small>{rangeLabel(result.earlier)}</small>
              </div>
            </div>
            <p className="an-modal-text">{openKpi.help}</p>
            {openKpi.earlier == null && (
              <p className="an-fine">
                Comparison is unavailable when the earlier period falls outside
                90-day retention, loading fails, or a report is incomplete.
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={modal?.type === "sources"}
        onClose={close}
        eyebrow="Traffic sources"
        title="All sources"
      >
        <Bars rows={sources} total={summary.views.length} />
        <p className="an-fine">
          “Direct / source unavailable” can mean a typed URL, a bookmark or an
          app that hides where people came from. Add ?utm_source=instagram to
          links you share to identify them reliably.
        </p>
      </Modal>

      <Modal
        open={modal?.type === "table"}
        onClose={close}
        eyebrow={result && rangeLabel(result.range)}
        title={trend?.hourly ? "Hourly activity" : "Daily activity"}
      >
        {trend && (
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>{trend.hourly ? "Hour" : "Date"}</th>
                  <th>Visits</th>
                  <th>Link clicks</th>
                </tr>
              </thead>
              <tbody>
                {trend.buckets.map((b, i) => (
                  <tr key={b.key}>
                    <td>{b.long}</td>
                    <td>{num(trend.values[0][i])}</td>
                    <td>{num(trend.values[1][i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={modal?.type === "about"}
        onClose={close}
        eyebrow="Privacy-first analytics"
        title="How these numbers work"
      >
        <ul className="an-about">
          <li>
            <b>Only consenting visitors are counted.</b> Visits appear after
            someone allows analytics and passes automatic verification. Declined
            consent, blockers and privacy settings leave visits unrecorded.
          </li>
          <li>
            <b>People are approximate (≈).</b> Each browser gets an anonymous
            ID. One person on two devices, or with cleared storage, counts as
            two.
          </li>
          <li>
            <b>Comparisons</b> use the preceding period of the same length, when
            it’s within the 90 days of retained records.
          </li>
          <li>
            <b>Sources</b> come from UTM tags first, then the referring website.
            Tag your bio links (e.g. ?utm_source=instagram) for the most
            reliable attribution.
          </li>
          <li>
            <b>Location</b> only appears when a trusted country source is
            configured. It’s never guessed.
          </li>
        </ul>
      </Modal>
    </div>
  );
}
