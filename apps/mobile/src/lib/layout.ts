import { Platform, useWindowDimensions } from "react-native";
import { appWidthFor, webFrameMode, type WebFrameMode } from "./layout-core";

export { APP_COLUMN_MAX_WIDTH, WEB_COLUMN_MIN_WINDOW, WEB_PANEL_MIN_WINDOW, type WebFrameMode } from "./layout-core";

/**
 * Usable app width for size calculations (title/sticker sizes).
 * Use instead of `useWindowDimensions().width`: on desktop web the app lives in a narrow column,
 * so screens must size themselves to the column, not to the browser window.
 */
export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return appWidthFor(Platform.OS, width);
}

/** Current desktop frame mode ("none" on native and on mobile-width web). */
export function useWebFrameMode(): WebFrameMode {
  const { width } = useWindowDimensions();
  return webFrameMode(Platform.OS, width);
}
