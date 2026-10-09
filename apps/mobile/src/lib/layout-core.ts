// Desktop web layout rules (pure; no React Native imports so vitest can test them).
// On wide browser windows the app is rendered in a centered, phone-width column; on even wider
// windows a brand panel appears to the left of the column. Native and narrow (mobile) web are untouched.

/** Window width (px) from which the web build is framed in a centered column. */
export const WEB_COLUMN_MIN_WINDOW = 768;
/** Window width (px) from which the brand panel is shown next to the column. */
export const WEB_PANEL_MIN_WINDOW = 1100;
/** Maximum width (px) of the app column (large-phone width). */
export const APP_COLUMN_MAX_WIDTH = 460;

export type WebFrameMode = "none" | "column" | "panel";

/** Which desktop frame applies for the given platform and window width. */
export function webFrameMode(os: string, windowWidth: number): WebFrameMode {
  if (os !== "web" || windowWidth < WEB_COLUMN_MIN_WINDOW) return "none";
  return windowWidth >= WEB_PANEL_MIN_WINDOW ? "panel" : "column";
}

/** Width the screens actually get: the column width when framed, otherwise the window width. */
export function appWidthFor(os: string, windowWidth: number): number {
  return webFrameMode(os, windowWidth) === "none" ? windowWidth : Math.min(windowWidth, APP_COLUMN_MAX_WIDTH);
}
