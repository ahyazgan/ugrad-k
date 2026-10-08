"use client";

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
    <div className="flex min-h-screen items-center justify-center bg-brand p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Yazgan Kurye</h1>
          <p className="text-sm text-slate-500">Yönetim paneli</p>
        </div>
        {repo.mode === "demo" ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
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
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </div>
  );
}
