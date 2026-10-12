import React, { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { configured, stats } from "./api";
import { csv, rangeDates, safeUrl, linkThumbnail } from "./model";
import { SocialIcon } from "./social-icons";
import {
  summarize,
  breakdown,
  sourceLabel,
  previousRange,
  changeLabel,
} from "./analytics-summary.js";
const pct = (value) => (value == null ? "—" : `${value.toFixed(1)}%`);
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function dateLabel(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function Bars({ rows, total, suffix = "visits" }) {
  return rows.length ? (
    rows.map(([label, count]) => (
      <div className="breakdown" key={label}>
        <div>
          <span>{label}</span>
          <strong>
            {count} {suffix} · {pct(total ? (count / total) * 100 : 0)}
          </strong>
        </div>
        <div className="bar">
          <i style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </div>
      </div>
    ))
  ) : (
    <p className="muted">No recorded activity in this period.</p>
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
    [kind, setKind] = useState("all");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setResult(null);
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
  const ranked = summary.ranked
    .filter((link) => kind === "all" || link.kind === kind)
    .sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b[sort] - a[sort],
    );
  const daily = new Map();
  if (result) {
    const date = new Date(result.range.from);
    for (
      let n = 0;
      date < new Date(result.range.to) && n < 366;
      n++, date.setDate(date.getDate() + 1)
    )
      daily.set(localDay(date), 0);
  }
  summary.views.forEach((event) => {
    const key = localDay(new Date(event.timestamp));
    daily.set(key, (daily.get(key) || 0) + 1);
  });
  const days = [...daily],
    max = Math.max(1, ...days.map((day) => day[1]));
  const metrics = [
    [
      "Visitors ≈",
      summary.visitors,
      previous?.visitors,
      "Different anonymous browser IDs that opened your page.",
    ],
    [
      "Visits",
      summary.views.length,
      previous?.views.length,
      "Recorded page opens, including repeat visits.",
    ],
    [
      "Link clicks",
      summary.clicks.length,
      previous?.clicks.length,
      "All clicks on link cards and social icons. Repeat clicks count.",
    ],
    [
      "Visitors who clicked",
      pct(summary.engagement),
      null,
      `${summary.engaged} of ${summary.visitors} recorded visitors clicked at least one destination.`,
    ],
  ];
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
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Your audience, explained</h2>
          <p>See what brings people here and which links they choose.</p>
        </div>
        <div className="analytics-actions">
          <select
            aria-label="Analytics date range"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "Today",
              "Yesterday",
              "Last 7 days",
              "Last 30 days",
              "Last 90 days",
              "Custom",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            className="button"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>
      {filter === "Custom" && (
        <div className="two-columns">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
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
        <div className="notice">
          Local demo · no sample traffic is presented as real. Connect Supabase
          to see recorded activity.
        </div>
      )}
      {loading ? (
        <p role="status">Loading your analytics…</p>
      ) : error ? (
        <div className="notice" role="alert">
          {error} Use Refresh to try again.
        </div>
      ) : (
        result && (
          <>
            <p className="muted small">
              {dateLabel(result.range.from)} — {dateLabel(result.range.to)} ·
              Your local time
            </p>
            {result.report.limited && (
              <div className="notice" role="alert">
                This period exceeds 20,000 events. Counts are incomplete; choose
                a shorter range. Comparisons are hidden.
              </div>
            )}
            {!events.length && (
              <div className="analytics-empty">
                <h3>No recorded visits yet</h3>
                <p>
                  Visits appear after someone allows analytics and completes
                  automatic verification. Open the public page, allow analytics,
                  click a link, then refresh here. Declined consent, blockers,
                  and privacy settings can leave visits unrecorded.
                </p>
              </div>
            )}
            <div className="metric-grid">
              {metrics.map(([label, value, earlier, help]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <p className="metric-help">{help}</p>
                  {label !== "Visitors who clicked" && (
                    <small>
                      {changeLabel(
                        typeof value === "number" ? value : 0,
                        earlier,
                      )}
                    </small>
                  )}
                </div>
              ))}
            </div>
            <p className="small muted">
              {previous
                ? `Compared with the preceding equally long period: ${dateLabel(result.earlier.from)} — ${dateLabel(result.earlier.to)}.`
                : "Earlier-period comparison is unavailable if records fall outside 90-day retention, loading fails, or a report is incomplete."}
            </p>
            <section className="panel analytics-destinations">
              <div className="panel-heading">
                <div>
                  <h3>Which links get clicked?</h3>
                  <p className="small muted">
                    See exactly where visitors go. Social icons count too.
                  </p>
                </div>
                <div className="analytics-actions">
                  <select
                    aria-label="Destination type"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="all">All destinations</option>
                    <option>Link card</option>
                    <option>Social icon</option>
                    <option>Historical link</option>
                    <option>Live stream</option>
                  </select>
                  <select
                    aria-label="Sort links"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="clicks">Most clicks</option>
                    <option value="unique">Most people clicking</option>
                    <option value="title">Name</option>
                  </select>
                </div>
              </div>
              <div className="destination-legend">
                <span>Destination</span>
                <span>Clicks / People ≈ / Share of all clicks</span>
              </div>
              {ranked.map((link, index) => (
                <article className="destination-row" key={link.id}>
                  <div className="destination-main">
                    <span className="destination-rank">{index + 1}</span>
                    <span className="destination-thumb">
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
                    <div className="destination-name">
                      <strong>{link.title}</strong>
                      <small>
                        {link.kind}
                        {link.url && ` · ${safeUrl(link.url)}`}
                      </small>
                    </div>
                    <div className="destination-numbers">
                      <strong>
                        {link.clicks}
                        <small>clicks</small>
                      </strong>
                      <span>
                        {link.unique}
                        <small>people ≈</small>
                      </span>
                      <span>
                        {pct(link.share)}
                        <small>of clicks</small>
                      </span>
                    </div>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${link.share}%` }} />
                  </div>
                  {link.clicks > 0 && (
                    <details>
                      <summary>Where these clicks came from</summary>
                      <Bars
                        rows={breakdown(link.events, "source", sourceLabel)}
                        total={link.clicks}
                        suffix="clicks"
                      />
                      <p className="small muted">
                        These are the sources visitors arrived from before
                        clicking this destination.
                      </p>
                    </details>
                  )}
                </article>
              ))}
              {!ranked.length && (
                <p className="muted">No destinations in this category.</p>
              )}
              <p className="small muted">
                Share of clicks = this destination’s clicks ÷ all recorded
                clicks. People counts use anonymous browser IDs. A click shows
                interest; it doesn’t confirm a purchase or follow.
              </p>
            </section>
            <div className="two-columns">
              <section className="panel">
                <h3>Where do visitors come from?</h3>
                <p className="small muted">
                  How people reached your page, based on recorded visits.
                </p>
                <Bars
                  rows={breakdown(summary.views, "source", sourceLabel)}
                  total={summary.views.length}
                />
                <p className="small muted">
                  Direct / source unavailable can mean a typed URL, bookmark, or
                  an app that hides its referrer. Add ?utm_source=instagram to a
                  shared URL to identify it more reliably.
                </p>
              </section>
              <section className="panel">
                <h3>What devices do they use?</h3>
                <Bars
                  rows={breakdown(
                    summary.views,
                    "device",
                    (value) =>
                      ({
                        mobile: "Phone",
                        desktop: "Computer",
                        tablet: "Tablet",
                      })[value] || "Unavailable",
                  )}
                  total={summary.views.length}
                />
                <h3>Returning visitors ≈</h3>
                <strong className="big-number">{summary.returning}</strong>
                <p className="small muted">
                  Browser IDs also seen before this period, within retained
                  records. Another device or cleared storage can look like a new
                  visitor.
                </p>
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <h3>Visits over time</h3>
                <span className="small muted">
                  {summary.views.length} recorded page opens
                </span>
              </div>
              <svg
                viewBox="0 0 600 180"
                className="traffic-chart"
                role="img"
                aria-label="Recorded visits per day"
              >
                <line x1="30" x2="570" y1="145" y2="145" stroke="#e7e7e1" />
                <text x="8" y="38" fontSize="10" fill="#888">
                  {max}
                </text>
                <text x="8" y="148" fontSize="10" fill="#888">
                  0
                </text>
                <polyline
                  points={days
                    .map(
                      (day, i) =>
                        `${30 + (i * 540) / Math.max(1, days.length - 1)},${145 - (day[1] * 110) / max}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#c74f36"
                  strokeWidth="3"
                />
                {days.length === 1 && (
                  <circle
                    cx="30"
                    cy={145 - (days[0][1] * 110) / max}
                    r="4"
                    fill="#c74f36"
                  />
                )}
                <text x="30" y="172" fontSize="10" fill="#888">
                  {days[0]?.[0]}
                </text>
                <text
                  x="570"
                  y="172"
                  fontSize="10"
                  fill="#888"
                  textAnchor="end"
                >
                  {days.at(-1)?.[0]}
                </text>
              </svg>
              <details>
                <summary>Read daily visit counts</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map(([day, count]) => (
                        <tr key={day}>
                          <td>{day}</td>
                          <td>{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <details className="panel">
              <summary>Location data</summary>
              {summary.views.some((event) => event.country) ? (
                <Bars
                  rows={breakdown(summary.views, "country")}
                  total={summary.views.length}
                />
              ) : (
                <p className="muted">
                  Country information isn’t available for these visits. It only
                  appears when a trusted country source is configured.
                </p>
              )}
            </details>
            <button
              className="button"
              onClick={exportData}
              disabled={!events.length}
            >
              <Download size={16} />
              Export recorded events (CSV)
            </button>
            <p className="small muted">
              Only consented, verified activity is recorded. These numbers won’t
              include every visitor. Records are retained for 90 days.
            </p>
          </>
        )
      )}
    </>
  );
}
