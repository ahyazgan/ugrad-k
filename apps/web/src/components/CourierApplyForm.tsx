"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { APPLICATION_DOCS, applyCourier, SiteApiError, type CourierApplicationInput, type DocKind } from "@/lib/api";
import { CARD } from "@/components/ui";

const AVAILABILITY = [
  ["tam_zamanli", "Tam zamanlı"],
  ["yari_zamanli", "Yarı zamanlı"],
  ["hafta_sonu", "Hafta sonu"],
] as const;

const DOC_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Turkish drop zone for one document. The native file input stays in the DOM (visually hidden but
 * keyboard-focusable) so the upload logic and e2e `setInputFiles` keep working; drag & drop sets the same state.
 */
function FileDrop({ kind, file, onChange }: { kind: DocKind; file: File | undefined; onChange: (f: File | undefined) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const clear = () => {
    onChange(undefined);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onChange(dropped);
      }}
      className={`rounded-2xl border-2 border-dashed p-3 text-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 ${
        over ? "border-brand bg-brand-light" : file ? "border-neo-dot bg-[#f6fde0]" : "border-slate-300 bg-neo-bg/40"
      }`}
    >
      <label htmlFor={inputId} className="block font-semibold text-slate-800">
        {APPLICATION_DOCS[kind]}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        data-testid={`apply-doc-${kind}`}
        accept={DOC_ACCEPT}
        onChange={(e) => onChange(e.target.files?.[0])}
        className="sr-only"
      />
      {file ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-slate-700" title={file.name}>
            <span aria-hidden="true">✓ </span>
            {file.name} <span className="text-slate-500">· {formatSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-brand underline hover:bg-white"
            aria-label={`${APPLICATION_DOCS[kind]} dosyasını kaldır`}
          >
            Kaldır
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500">
          <label htmlFor={inputId} className="cursor-pointer rounded-full bg-brand px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-black">
            Dosya seç
          </label>
          <span>veya buraya sürükleyin</span>
        </div>
      )}
    </div>
  );
}

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
    <form onSubmit={submit} className={`grid gap-4 p-5 sm:p-6 ${CARD}`} noValidate>
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
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          Belgeler <span className="font-normal text-slate-500">(isteğe bağlı · JPG, PNG veya PDF · en fazla 5 MB)</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(APPLICATION_DOCS) as DocKind[]).map((k) => (
            <FileDrop key={k} kind={k} file={files[k]} onChange={(file) => setFiles({ ...files, [k]: file })} />
          ))}
        </div>
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
      <button type="submit" data-testid="apply-submit" disabled={state === "sending"} className="rounded-full bg-brand px-6 py-3.5 font-extrabold text-white hover:bg-black disabled:opacity-60">
        {state === "sending" ? "Gönderiliyor…" : "Başvuruyu gönder"}
      </button>
    </form>
  );
}
