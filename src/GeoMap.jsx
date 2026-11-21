import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, RotateCcw } from "lucide-react";

import { RAMP } from "./map-ramp.js";
const EMPTY = "#ecebe7";
let geo; // cached { paths, projection } loader

async function load() {
  if (!geo)
    geo = Promise.all([
      import("d3-geo"),
      import("topojson-client"),
      import("world-atlas/countries-110m.json"),
      import("i18n-iso-countries"),
    ]).then(([d3, topo, world, iso]) => {
      const atlas = world.default || world;
      const codes = iso.default || iso;
      const shapes = topo
        .feature(atlas, atlas.objects.countries)
        .features.filter((f) => f.id !== "010") // Antarctica
        .map((f) => ({ ...f, code: codes.numericToAlpha2(f.id) || "" }));
      return { d3, shapes };
    });
  return geo;
}

function step(count, max) {
  if (!count) return EMPTY;
  // Square-root scale so one big country doesn't wash out the rest.
  const i = Math.min(
    RAMP.length - 1,
    Math.floor(Math.sqrt(count / max) * RAMP.length),
  );
  return RAMP[i];
}

export default function GeoMap({ rows, width }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  const height = Math.round(width * 0.52);
  const counts = useMemo(
    () => new Map(rows.map((r) => [r.key, r.count])),
    [rows],
  );
  const max = Math.max(1, ...rows.map((r) => r.count));
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      return null;
    }
  }, []);
  const paths = useMemo(() => {
    if (!data || !width) return [];
    const projection = data.d3
      .geoNaturalEarth1()
      .fitSize([width, height], { type: "Sphere" });
    const path = data.d3.geoPath(projection);
    return data.shapes.map((f) => ({ code: f.code, d: path(f) }));
  }, [data, width, height]);
  if (failed)
    return (
      <p className="an-empty-line">
        The map couldn’t load. The breakdown still lists every country.
      </p>
    );
  if (!data || !width)
    return <div className="an-map-skeleton" style={{ height }} />;
  const zoomBy = (factor) =>
    setZoom((z) => {
      const k = Math.min(8, Math.max(1, z.k * factor));
      // Keep the view centred while zooming.
      const cx = width / 2,
        cy = height / 2;
      return k === 1
        ? { k: 1, x: 0, y: 0 }
        : { k, x: cx - ((cx - z.x) * k) / z.k, y: cy - ((cy - z.y) * k) / z.k };
    });
  const label = (code) => (code && names?.of(code)) || code || "Unknown";
  return (
    <div className="an-map" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="World map shaded by visits per country"
        onPointerDown={(e) => {
          if (zoom.k > 1)
            drag.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setZoom((z) => ({
              ...z,
              x: e.clientX - drag.current.x,
              y: e.clientY - drag.current.y,
            }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
        }}
        style={{ cursor: zoom.k > 1 ? "grab" : "default" }}
      >
        <g transform={`translate(${zoom.x},${zoom.y}) scale(${zoom.k})`}>
          {paths.map((p, i) => (
            <path
              key={p.code || i}
              d={p.d}
              fill={step(counts.get(p.code) || 0, max)}
              stroke="#fff"
              strokeWidth={0.6 / zoom.k}
              onPointerEnter={(e) => {
                const box =
                  e.currentTarget.ownerSVGElement.getBoundingClientRect();
                setHover({
                  code: p.code,
                  x: e.clientX - box.left,
                  y: e.clientY - box.top,
                });
              }}
              onPointerMove={(e) => {
                const box =
                  e.currentTarget.ownerSVGElement.getBoundingClientRect();
                setHover({
                  code: p.code,
                  x: e.clientX - box.left,
                  y: e.clientY - box.top,
                });
              }}
            />
          ))}
        </g>
      </svg>
      <div className="an-map-zoom">
        <button
          className="an-icon-button small"
          onClick={() => zoomBy(1.6)}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          className="an-icon-button small"
          onClick={() => zoomBy(1 / 1.6)}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </button>
        <button
          className="an-icon-button small"
          onClick={() => setZoom({ k: 1, x: 0, y: 0 })}
          aria-label="Reset map"
        >
          <RotateCcw size={13} />
        </button>
      </div>
      {hover && (
        <div
          className="an-tooltip"
          style={{
            left: Math.min(Math.max(hover.x, 70), width - 70),
            top: Math.max(0, hover.y - 64),
          }}
        >
          <strong>{label(hover.code)}</strong>
          <span>
            Activity<b>{(counts.get(hover.code) || 0).toLocaleString()}</b>
          </span>
        </div>
      )}
    </div>
  );
}
