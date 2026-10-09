"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { submitLead, SiteApiError, type LeadInput } from "@/lib/api";
import { CARD } from "@/components/ui";

const VOLUMES = ["1-10", "10-20", "20-50", "50+"];

/** Kurumsal başvuru / iletişim formu. Başvurular panelde "Başvurular" sayfasına düşer, yöneticiye uyarı gider. */
export function LeadForm({ kind, sourcePage }: { kind: LeadInput["kind"]; sourcePage: string }) {
  const [f, setF] = useState({ companyName: "", contactName: "", phone: "", email: "", monthlyVolume: "", message: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await submitLead({ kind, sourcePage, kvkkConsent: consent, ...f });
      setState("done");
    } catch (err) {
      setError(err instanceof SiteApiError ? { message: err.message, field: err.field } : { message: "Gönderilemedi, lütfen tekrar deneyin" });
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900" data-testid="lead-done">
        <div className="text-lg font-bold">Teşekkürler, başvurunuz alındı.</div>
        <p className="mt-1 text-sm">En kısa sürede sizi arayacağız.</p>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2";
  const bad = (field: string) => (error?.field === field ? "border-red-500" : "");
  return (
    <form onSubmit={submit} className={`grid gap-4 p-5 sm:p-6 ${CARD}`} noValidate>
      {kind === "kurumsal" ? (
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Firma adı
          <input className={`${input} ${bad("companyName")}`} data-testid="lead-company" value={f.companyName} onChange={set("companyName")} required />
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Ad soyad
          <input className={`${input} ${bad("contactName")}`} data-testid="lead-name" value={f.contactName} onChange={set("contactName")} autoComplete="name" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Telefon
          <input className={`${input} ${bad("phone")}`} data-testid="lead-phone" value={f.phone} onChange={set("phone")} type="tel" autoComplete="tel" placeholder="05xx xxx xx xx" required />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          E-posta <span className="font-normal text-slate-500">(isteğe bağlı)</span>
          <input className={`${input} ${bad("email")}`} value={f.email} onChange={set("email")} type="email" autoComplete="email" />
        </label>
        {kind === "kurumsal" ? (
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Aylık tahmini gönderi
            <select className={input} data-testid="lead-volume" value={f.monthlyVolume} onChange={set("monthlyVolume")}>
              <option value="">Seçin</option>
              {VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Mesajınız <span className="font-normal text-slate-500">(isteğe bağlı)</span>
        <textarea className={input} rows={3} value={f.message} onChange={set("message")} />
      </label>
      {/* Bal küpü: insanlar görmez, botlar doldurur */}
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set("website")} />
      <label className={`flex items-start gap-2 text-sm text-slate-600 ${error?.field === "kvkkConsent" ? "text-red-700" : ""}`}>
        <input type="checkbox" data-testid="lead-consent" className="mt-1 h-4 w-4 accent-[#111114] focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:outline-none" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Bilgilerimin başvurumun değerlendirilmesi ve benimle iletişime geçilmesi amacıyla işlenmesine ilişkin{" "}
          <Link href="/kvkk#basvuru" className="text-brand underline" target="_blank">
            aydınlatma metnini
          </Link>{" "}
          okudum.
        </span>
      </label>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p> : null}
      <button type="submit" data-testid="lead-submit" disabled={state === "sending"} className="rounded-full bg-brand px-6 py-3.5 font-extrabold text-white hover:bg-black focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60">
        {state === "sending" ? "Gönderiliyor…" : kind === "kurumsal" ? "Kurumsal hesap başvurusu gönder" : "Gönder"}
      </button>
    </form>
  );
}
