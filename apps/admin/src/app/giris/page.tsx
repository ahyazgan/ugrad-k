"use client";

import { BRAND } from "@yazgan/shared";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Button, ErrorText, Input } from "@/components/ui";
import { repo } from "@/lib/repo";

export default function GirisPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await repo.signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-brand-light px-5 py-10">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-[1.15fr_1fr]">
        <section className="text-brand">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted">{BRAND.name} · Yönetim paneli</p>
          <h1 className="mt-3 text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[56px]">
            Bugünün işleri
            <br />
            <span className="relative inline-block">
              <span className="absolute inset-x-[-6px] bottom-1 top-[42%] rounded-md bg-accent" aria-hidden="true" />
              <span className="relative">tek ekranda.</span>
            </span>
          </h1>
          <p className="mt-4 max-w-md text-base text-ink-soft">
            Siparişler, kuryeler, faturalar ve uyarılar. Giriş yapın, bekleyen işler sizi karşılasın.
          </p>
          <Image src="/neo/motor.png" alt="" width={96} height={96} priority className="mt-8 h-24 w-24 object-contain" />
        </section>

        <form onSubmit={submit} className="w-full space-y-4 rounded-card border border-line bg-white p-6 shadow-[0_18px_50px_-24px_rgba(17,17,20,0.35)] sm:p-8">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-brand">Giriş</h2>
            <p className="text-sm text-muted">Yönetici hesabınızla devam edin.</p>
          </div>
          {repo.mode === "demo" ? (
            <p className="rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Demo: <b>admin@yazgankurye.com</b> / <b>demo1234</b>
            </p>
          ) : null}
          <Input label="E-posta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Şifre"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading} className="w-full py-2.5">
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </Button>
        </form>
      </div>
    </main>
  );
}
