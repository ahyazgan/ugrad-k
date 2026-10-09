import { describe, expect, it } from "vitest";
import { APP_COLUMN_MAX_WIDTH, WEB_COLUMN_MIN_WINDOW, WEB_PANEL_MIN_WINDOW, appWidthFor, webFrameMode } from "../src/lib/layout-core";

describe("desktop web frame", () => {
  it("never frames native apps, even on wide tablets", () => {
    expect(webFrameMode("ios", 1366)).toBe("none");
    expect(webFrameMode("android", 1920)).toBe("none");
    expect(appWidthFor("ios", 1024)).toBe(1024);
  });

  it("leaves mobile-width web untouched", () => {
    for (const w of [320, 390, 430, 700, WEB_COLUMN_MIN_WINDOW - 1]) {
      expect(webFrameMode("web", w)).toBe("none");
      expect(appWidthFor("web", w)).toBe(w);
    }
  });

  it("uses a centered column from the column breakpoint, panel from the panel breakpoint", () => {
    expect(webFrameMode("web", WEB_COLUMN_MIN_WINDOW)).toBe("column");
    expect(webFrameMode("web", 1024)).toBe("column");
    expect(webFrameMode("web", WEB_PANEL_MIN_WINDOW - 1)).toBe("column");
    expect(webFrameMode("web", WEB_PANEL_MIN_WINDOW)).toBe("panel");
    expect(webFrameMode("web", 1920)).toBe("panel");
  });

  it("gives screens the column width when framed", () => {
    expect(appWidthFor("web", 1024)).toBe(APP_COLUMN_MAX_WIDTH);
    expect(appWidthFor("web", 1920)).toBe(APP_COLUMN_MAX_WIDTH);
  });
});
