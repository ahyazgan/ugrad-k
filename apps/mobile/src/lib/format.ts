const TZ = "Europe/Istanbul";

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
