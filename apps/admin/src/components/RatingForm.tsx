"use client";

import { useState } from "react";
import { submitRating } from "@/lib/tracking";

const LABELS = ["", "Çok kötü", "Kötü", "Orta", "İyi", "Mükemmel"];

/** Teslim sonrası 1–5 yıldız + yorum. 5 puanda Google yorumuna davet eder. */
export function RatingForm({ token, initial, onDone }: { token: string; initial: number | null; onDone?: () => void }) {
  const [score, setScore] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">(initial ? "done" : "idle");
  const [google, setGoogle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div data-testid="rating-done">
        <p className="font-semibold text-slate-900">
          Değerlendirmeniz için teşekkürler! <span className="text-accent">{"★".repeat(score)}</span>
        </p>
        {google ? (
          <a href={google} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white" data-testid="google-review">
            Google&apos;da da yorum yazar mısınız?
          </a>
        ) : score && score <= 3 ? (
          <p className="mt-1 text-sm text-slate-600">Yaşadığınız sorunu ekibimize ilettik; sizinle iletişime geçeceğiz.</p>
        ) : null}
      </div>
    );
  }

  const shown = hover || score;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!score) return;
        setState("sending");
        setError(null);
        try {
          const r = await submitRating(token, score, comment);
          setGoogle(r.googleReviewUrl);
          setState("done");
          onDone?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gönderilemedi");
          setState("idle");
        }
      }}
    >
      <div className="font-semibold text-slate-900">Teslimatı nasıl buldunuz?</div>
      <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Puan" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} yıldız`}
            data-testid={`star-${n}`}
            onClick={() => setScore(n)}
            onMouseEnter={() => setHover(n)}
            className={`text-3xl leading-none transition ${n <= shown ? "text-accent" : "text-slate-300"}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-500">{LABELS[shown]}</span>
      </div>
      {score ? (
        <>
          <textarea
            className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-brand"
            rows={2}
            maxLength={1000}
            placeholder={score <= 3 ? "Neyi daha iyi yapabilirdik?" : "Eklemek istediğiniz bir şey var mı? (isteğe bağlı)"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="submit" disabled={state === "sending"} className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60" data-testid="rating-submit">
            Gönder
          </button>
        </>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
