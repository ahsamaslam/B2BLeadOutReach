/**
 * SendMaster — design tokens (TypeScript)
 *
 * Mirror of CSS variables in tokens.css. Use these in JS/TS where you
 * cannot reach for a CSS variable directly (e.g. canvas, SVG, charts).
 * Otherwise, prefer the `var(--name)` form in styles.
 */

export const colors = {
  bg: "#fafaf7",
  bgElev: "#ffffff",
  bgSunken: "#f4f3ee",
  bgTinted: "#f7f6f1",

  border: "#ebe9e2",
  borderStrong: "#d9d6cc",
  borderSubtle: "#f0eee8",

  ink1: "#1a1916",
  ink2: "#4a4844",
  ink3: "#7a766f",
  ink4: "#a8a39a",

  brand: "#5b5fcf",
  brandInk: "#3b3fa8",
  brandSoft: "#eef0fd",
  brandSoft2: "#e2e5fb",
  brandRing: "rgba(91, 95, 207, 0.18)",

  green: "#2f8f5e",
  greenSoft: "#e7f3eb",
  amber: "#b97211",
  amberSoft: "#fbf0db",
  red: "#c4423b",
  redSoft: "#fbe9e7",
  violet: "#7a4ec2",
  violetSoft: "#f1e9fa",
  teal: "#2b7d7a",
  tealSoft: "#e3f1f0",
} as const;

export const typography = {
  sans: '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  serif: '"Instrument Serif", ui-serif, Georgia, serif',
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
} as const;

export const shadow = {
  sh1: "0 1px 0 rgba(20, 19, 16, 0.04), 0 1px 2px rgba(20, 19, 16, 0.04)",
  sh2: "0 1px 0 rgba(20, 19, 16, 0.04), 0 4px 14px -4px rgba(20, 19, 16, 0.08)",
  sh3: "0 8px 28px -10px rgba(20, 19, 16, 0.16), 0 2px 6px rgba(20, 19, 16, 0.06)",
  shPop: "0 24px 60px -20px rgba(20, 19, 16, 0.30), 0 6px 18px -6px rgba(20, 19, 16, 0.12)",
} as const;

export type StatusTone = "brand" | "green" | "amber" | "red" | "violet" | "teal" | "default";

export const toneColor: Record<Exclude<StatusTone, "default">, { fg: string; bg: string }> = {
  brand:  { fg: colors.brandInk, bg: colors.brandSoft },
  green:  { fg: colors.green,    bg: colors.greenSoft },
  amber:  { fg: colors.amber,    bg: colors.amberSoft },
  red:    { fg: colors.red,      bg: colors.redSoft },
  violet: { fg: colors.violet,   bg: colors.violetSoft },
  teal:   { fg: colors.teal,     bg: colors.tealSoft },
};
