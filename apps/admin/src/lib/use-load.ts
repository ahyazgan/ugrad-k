"use client";

import { useCallback, useEffect, useState } from "react";

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Basit veri yükleme kancası. `deps` değiştiğinde veya `reload()` çağrıldığında
 * `fn` yeniden çalışır; eski isteklerin sonucu yok sayılır.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const key = JSON.stringify(deps);

  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: unknown) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Yüklenemedi", loading: false })),
    );
    return () => {
      alive = false;
    };
    // fn her render'da yeni; yeniden çalıştırma deps (key) ve version ile kontrol edilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}
