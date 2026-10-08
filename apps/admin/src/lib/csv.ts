/** Excel (Türkçe) uyumlu CSV: noktalı virgül ayraç + UTF-8 BOM. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Kuruşu CSV için "1234,50" biçiminde yazar. */
export const kurusToCsv = (k: number) => (k / 100).toFixed(2).replace(".", ",");
