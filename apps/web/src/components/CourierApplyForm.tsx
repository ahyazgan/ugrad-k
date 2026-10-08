"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { APPLICATION_DOCS, applyCourier, SiteApiError, type CourierApplicationInput, type DocKind } from "@/lib/api";

const AVAILABILITY = [
  ["tam_zamanli", "Tam zamanlı"],
  ["yari_zamanli", "Yarı zamanlı"],
  ["hafta_sonu", "Hafta sonu"],
] as const;

export function CourierApplyForm() {
  const [f, setF] = useState<CourierApplicationInput>({ fullName: "", phone: "", hasMotorcycle: true, kvkkConsent: false, availability: "tam_zamanli" });
  const [files, setFiles] = useState<Partial<Record<DocKind, File>>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const set = (k: keyof CourierApplicationInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await applyCourier(f, files);
      setState("done");
    } catch (err) {
      setError(err instanceof SiteApiError ? { message: err.message, field: err.field } : { message: "Gönderilemedi, lütfen tekrar deneyin" });
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900" data-testid="apply-done">
        <div className="text-lg font-bold">Başvurunuz alındı, teşekkürler!</div>
        <p className="mt-1 text-sm">Başvurunuzu inceleyip görüşme için sizi arayacağız.</p>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
  const bad = (k: string) => (error?.field === k ? " border-red-500" : "");
  const label = "grid gap-1 text-sm font-semibold text-slate-700";
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Ad soyad
          <input className={input + bad("fullName")} data-testid="apply-name" value={f.fullName} onChange={set("fullName")} autoComplete="name" />
        </label>
        <label className={label}>
          Cep telefonu
          <input className={input + bad("phone")} data-testid="apply-phone" value={f.phone} onChange={set("phone")} type="tel" autoComplete="tel" placeholder="05xx xxx xx xx" />
        </label>
        <label className={label}>
          Doğum yılı
          <input className={input + bad("birthYear")} data-testid="apply-birth" value={f.birthYear ?? ""} onChange={set("birthYear")} inputMode="numeric" placeholder="1995" />
        </label>
        <label className={label}>
          Oturduğunuz ilçe
          <input className={input} value={f.district ?? ""} onChange={set("district")} placeholder="ör. Ümraniye" />
        </label>
        <label className={label}>
          Ehliyet sınıfı
          <select className={input} value={f.licenseClass ?? ""} onChange={set("licenseClass")}>
            <option value="">Seçin</option>
            {["A1", "A2", "A", "B (A1 yetkili)"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Çalışma şekli
          <select className={input} value={f.availability} onChange={set("availability")}>
            {AVAILABILITY.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={f.hasMotorcycle} onChange={(e) => setF({ ...f, hasMotorcycle: e.target.checked })} className="h-4 w-4" />
        Kendi motosikletim var
      </label>
      {f.hasMotorcycle ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Plaka
            <input className={input} value={f.plate ?? ""} onChange={set("plate")} placeholder="34 ABC 123" />
          </label>
          <label className={label}>
            Marka / model
            <input className={input} value={f.vehicleModel ?? ""} onChange={set("vehicleModel")} placeholder="ör. Honda PCX 125" />
          </label>
        </div>
      ) : null}
      <label className={label}>
        Kuryelik deneyimi (yıl)
        <input className={input + bad("experienceYears")} value={f.experienceYears ?? ""} onChange={set("experienceYears")} inputMode="numeric" placeholder="0" />
      </label>
      <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Belgeler (isteğe bağlı · JPG, PNG veya PDF · en fazla 5 MB)</legend>
        {(Object.keys(APPLICATION_DOCS) as DocKind[]).map((k) => (
          <label key={k} className="grid gap-1 text-sm text-slate-700 sm:grid-cols-[180px_1fr] sm:items-center">
            {APPLICATION_DOCS[k]}
            <input
              type="file"
              data-testid={`apply-doc-${k}`}
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] })}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:font-semibold file:text-brand"
            />
          </label>
        ))}
      </fieldset>
      <label className={label}>
        Eklemek istedikleriniz <span className="font-normal text-slate-500">(isteğe bağlı)</span>
        <textarea className={input} rows={3} value={f.message ?? ""} onChange={set("message")} />
      </label>
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website ?? ""} onChange={set("website")} />
      <label className={`flex items-start gap-2 text-sm text-slate-600 ${error?.field === "kvkkConsent" ? "text-red-700" : ""}`}>
        <input type="checkbox" data-testid="apply-consent" className="mt-1 h-4 w-4" checked={f.kvkkConsent} onChange={(e) => setF({ ...f, kvkkConsent: e.target.checked })} />
        <span>
          Başvuru bilgilerimin ve belgelerimin işe alım değerlendirmesi amacıyla işlenmesine ve en fazla 1 yıl saklanmasına ilişkin{" "}
          <Link href="/kvkk#basvuru" className="text-brand underline" target="_blank">
            aydınlatma metnini
          </Link>{" "}
          okudum.
        </span>
      </label>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p> : null}
      <button type="submit" data-testid="apply-submit" disabled={state === "sending"} className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60">
        {state === "sending" ? "Gönderiliyor…" : "Başvuruyu gönder"}
      </button>
    </form>
  );
}
