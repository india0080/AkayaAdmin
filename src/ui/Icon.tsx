// Console icon set — 24px grid, 1.75 stroke, round caps/joins, currentColor.
// Rounded geometric line icons in the spirit of the app's Material Rounded
// set, drawn inline so the console needs no icon dependency or font CDN.
// Decorative by default (aria-hidden); pass `label` when an icon stands alone.

import type { SVGProps } from "react";

const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9.5 20v-6h5v6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7",
  user: "M19 20v-1.5a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  "user-cog": "M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 13v1.2M19 19.8V21M16.2 17h-1.2M23 17h-1.2M17 15l.8.8M20.2 18.2l.8.8M17 19l.8-.8M20.2 15.8 21 15M19 18.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  card: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3 10h18M7 15h3",
  sparkles: "M12 3.5l1.6 4.4L18 9.5l-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  cpu: "M7 7h10v10H7zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4M10 10h4v4h-4z",
  route: "M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.5 16.5H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5",
  brain: "M12 5.5a3 3 0 0 0-5.7-1.3A3 3 0 0 0 4 8a3 3 0 0 0 .5 5.3A3.5 3.5 0 0 0 9 18.5a3 3 0 0 0 3 1.5zM12 5.5a3 3 0 0 1 5.7-1.3A3 3 0 0 1 20 8a3 3 0 0 1-.5 5.3 3.5 3.5 0 0 1-4.5 5.2 3 3 0 0 1-3 1.5M12 5.5V20",
  puzzle: "M10 4.5a2 2 0 1 1 4 0V6h3a1 1 0 0 1 1 1v3h-1.5a2 2 0 1 0 0 4H18v3a1 1 0 0 1-1 1h-3v-1.5a2 2 0 1 0-4 0V18H7a1 1 0 0 1-1-1v-3h1.5a2 2 0 1 0 0-4H6V7a1 1 0 0 1 1-1h3z",
  wrench: "M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.3-.7-.7-2.3z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  masks: "M4 5h9v5a4.5 4.5 0 0 1-9 0zM7 8.5h.01M10 8.5h.01M7.5 12a2 2 0 0 0 2 0M13 9h7v5a4.5 4.5 0 0 1-7.5 3.4M16 12.5h.01M18.5 12.5h.01M16 16a2 2 0 0 1 2.5 0",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3M18.5 11.5a6.5 6.5 0 0 1-13 0M12 18v3",
  bubble: "M4 12a8 8 0 1 1 3.3 6.5L4 20l1.1-3.4A8 8 0 0 1 4 12M9 12h.01M12 12h.01M15 12h.01",
  layers: "M12 3 3 8l9 5 9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  lifebuoy: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  inbox: "M4 13.5 6.5 5h11l2.5 8.5V19H4zM4 13.5h4.5l1 2h5l1-2H20",
  "flag-alert": "M5 21V4h11l-2 4 2 4H5M10.5 6.5v2.5M10.5 11h.01",
  megaphone: "M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12",
  bell: "M6 9.5a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5M10 19.5a2 2 0 0 0 4 0",
  "bell-alert": "M6 9.5a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5M10 19.5a2 2 0 0 0 4 0M12 7v4M12 13h.01",
  chart: "M4 20V4M4 20h16M8 16l3.5-4.5 3 2.5L20 7",
  server: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3A1.5 1.5 0 0 1 18.5 10h-13A1.5 1.5 0 0 1 4 8.5zM4 15.5A1.5 1.5 0 0 1 5.5 14h13a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM7.5 7h.01M7.5 17h.01",
  "heart-pulse": "M20.5 9.5c0 5.5-8.5 11-8.5 11s-8.5-5.5-8.5-11A4.5 4.5 0 0 1 12 6.8a4.5 4.5 0 0 1 8.5 2.7M3.5 12h4l1.5-2.5 2.5 5 1.5-2.5h7.5",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z",
  key: "M14.5 14a5 5 0 1 0-4.7-3.3L3 17.5V21h3.5v-2h2v-2h2l2.3-2.3a5 5 0 0 0 1.7.3M16.5 8.5h.01",
  scroll: "M8 3h10a2 2 0 0 1 2 2v1h-4M8 3a2 2 0 0 0-2 2v12H4v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5M8 3a2 2 0 0 1 2 2M10 9h5M10 13h5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-up": "M6 15l6-6 6 6",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  "check-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12.5l2.7 2.7L16 9.8",
  "x-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9 9l6 6M15 9l-6 6",
  "alert-triangle": "M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.5M12 7.5h.01",
  "minus-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12h8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5",
  monitor: "M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5zM8.5 20h7M12 16v4",
  menu: "M4 7h16M4 12h16M4 17h16",
  "log-out": "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4",
  refresh: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
  plus: "M12 5v14M5 12h14",
  filter: "M4 5h16l-6 7.5V19l-4 1.5v-8z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sort: "M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3",
  "sort-asc": "M12 19V5M7 10l5-5 5 5",
  "sort-desc": "M12 5v14M7 14l5 5 5-5",
  copy: "M9 9h10v11H9zM6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 1 1 7 0v3",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  pin: "M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6",
  history: "M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 8v4.5l3 1.5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  edit: "M17 3l4 4L9 19l-5 1 1-5zM13 7l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
};

export type IconKey = keyof typeof P;

export function Icon({
  name,
  size = 18,
  label,
  className,
  ...rest
}: { name: string; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const d = P[name] ?? P.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
