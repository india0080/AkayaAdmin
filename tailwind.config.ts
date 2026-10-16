import type { Config } from "tailwindcss";

// Akaya Console theme. Every colour resolves to a CSS variable in
// src/design/tokens.css, so light/dark is a data-theme switch, not a class
// sweep. Opaque tokens use the channel form (`rgb(var(--x) / <alpha-value>)`)
// so opacity modifiers work (`bg-fg/5`); the *-soft tokens are full colours.
//
// Legacy pages still use raw hex classes (bg-[#111] …) and render inside a
// data-theme="dark" "classic" region until their domain is migrated.
const ch = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/shell/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: ch("canvas"),
        panel: { DEFAULT: ch("panel"), 2: ch("panel-2") },
        sidebar: ch("sidebar"),
        raised: ch("raised"),
        line: { DEFAULT: ch("line"), strong: ch("line-strong") },
        fg: { DEFAULT: ch("fg"), muted: ch("fg-muted"), subtle: ch("fg-subtle") },
        accent: {
          DEFAULT: ch("accent"),
          solid: ch("accent-solid"),
          "solid-hover": ch("accent-solid-hover"),
          text: ch("accent-text"),
          soft: "var(--accent-soft)",
          on: ch("on-accent"),
        },
        success: { DEFAULT: ch("success"), soft: "var(--success-soft)" },
        warning: { DEFAULT: ch("warning"), soft: "var(--warning-soft)" },
        danger: { DEFAULT: ch("danger"), soft: "var(--danger-soft)" },
        info: { DEFAULT: ch("info"), soft: "var(--info-soft)" },
        neutral: { DEFAULT: ch("neutral"), soft: "var(--neutral-soft)" },
        plan: { free: ch("plan-free"), silver: ch("plan-silver"), gold: ch("plan-gold") },
        scrim: ch("scrim"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        // Console scale: dense by default, display sizes only for page titles.
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        md: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "26px" }],
        xl: ["22px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
        "2xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        overlay: "var(--shadow-overlay)",
      },
      transitionDuration: { DEFAULT: "150ms" },
      zIndex: { nav: "30", top: "40", overlay: "50", toast: "60" },
    },
  },
  plugins: [],
};
export default config;
