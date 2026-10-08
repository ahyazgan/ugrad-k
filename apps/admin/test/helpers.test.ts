import { describe, expect, it } from "vitest";
import { kurusToCsv, toCsv } from "../src/lib/csv";
import { hoursBetween, istDate, istDayStartUtc, istMonthRangeUtc } from "../src/lib/dates";

describe("csv", () => {
  it("BOM, noktalı virgül ve kaçış", () => {
    const s = toCsv([["a;b", 'x"y', null, 3]]);
    expect(s.startsWith("﻿")).toBe(true);
    expect(s.slice(1)).toBe('"a;b";"x""y";;3');
  });
  it("kuruş → Türkçe ondalık", () => {
    expect(kurusToCsv(123450)).toBe("1234,50");
  });
});

describe("İstanbul tarihleri", () => {
  it("UTC 21:30 ertesi güne düşer", () => {
    expect(istDate("2026-10-28T21:30:00Z")).toBe("2026-10-29");
  });
  it("gün başlangıcı UTC-3", () => {
    expect(istDayStartUtc("2026-10-29")).toBe("2026-10-28T21:00:00.000Z");
  });
  it("ay aralığı ve yıl geçişi", () => {
    expect(istMonthRangeUtc("2026-12")).toEqual(["2026-11-30T21:00:00.000Z", "2026-12-31T21:00:00.000Z"]);
  });
  it("açık vardiya şimdiye kadar sayılır", () => {
    expect(hoursBetween("2026-10-08T06:00:00Z", null, new Date("2026-10-08T08:30:00Z"))).toBe(2.5);
  });
});

import { toTranscript } from "../src/lib/repo/transcript";

describe("asistan yazışması", () => {
  it("bağlam satırını, araç ve düşünme bloklarını atlar", () => {
    const t = toTranscript([
      { role: "user", content: "[Müşteri bilgisi — sistem tarafından eklendi] Ad: Ayşe\n\nmerhaba" },
      { role: "assistant", content: [{ type: "thinking" }, { type: "tool_use" }] },
      { role: "user", content: [{ type: "tool_result" }] },
      { role: "assistant", content: [{ type: "thinking" }, { type: "text", text: "Fiyat 410 TL" }] },
    ]);
    expect(t).toEqual([
      { role: "user", text: "merhaba" },
      { role: "assistant", text: "Fiyat 410 TL" },
    ]);
  });
});
