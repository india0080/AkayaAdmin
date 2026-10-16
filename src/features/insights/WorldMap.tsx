"use client";

// Choropleth world map with a hover tooltip. Uses the bundled Natural Earth
// 5.1.2 paths (public domain) already shipped in worldPaths.json — no map
// library or network tiles.

import { useState } from "react";
import { formatNumber } from "@/ui";
import paths from "./worldPaths.json";

export interface CountryValue { country: string; users: number; sessions?: number }

export function WorldMap({ data, label = "World map of active users by country" }: { data: CountryValue[]; label?: string }) {
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const byCode = new Map(data.map((d) => [d.country, d]));
  const max = Math.max(1, ...data.map((d) => d.users));
  const total = data.reduce((s, d) => s + d.users, 0) || 1;
  const hit = hover ? byCode.get(hover.code) : undefined;
  const name = hover ? paths.find((p) => p.code === hover.code)?.name ?? hover.code : "";
  return (
    <div className="relative">
      <svg viewBox="0 0 720 300" className="h-auto w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {paths.map((p) => {
          const users = byCode.get(p.code)?.users ?? 0;
          return (
            <path key={p.name} d={p.d} stroke="rgb(var(--panel))" strokeWidth={0.4}
              fill={users ? `rgb(var(--accent) / ${0.2 + 0.8 * Math.sqrt(users / max)})` : "rgb(var(--raised))"}
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ code: p.code, x: e.clientX - box.left, y: e.clientY - box.top });
              }}>
              <title>{p.name}</title>
            </path>
          );
        })}
      </svg>
      {hover ? (
        <div role="tooltip" className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}>
          <p className="font-semibold text-fg">{name}</p>
          {hit ? <>
            <p className="text-fg-muted">{formatNumber(hit.users)} active users · {((hit.users / total) * 100).toFixed(1)}%</p>
            {hit.sessions != null ? <p className="text-fg-muted">{formatNumber(hit.sessions)} sessions</p> : null}
          </> : <p className="text-fg-subtle">No tracked users</p>}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-2xs text-fg-subtle">
        <span>Low</span><span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-[rgb(var(--accent)/0.2)] to-[rgb(var(--accent))]" /><span>High</span>
        <span className="ml-auto">Natural Earth · public domain · estimated device country</span>
      </div>
    </div>
  );
}
