import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Profile, type Session } from "./api";
import { registerForPush } from "./push";

interface SessionState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** KVKK aydınlatma + konum açık rızası verilmiş mi */
  consented: boolean;
  refresh(): Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, "refresh">>({
    loading: true,
    session: null,
    profile: null,
    consented: false,
  });

  const load = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ loading: false, session: null, profile: null, consented: false });
      return;
    }
    try {
      const [profile, consents] = await Promise.all([api.getProfile(), api.getConsents()]);
      registerForPush(); // arka planda; başarısız olursa bildirimler SMS ile gider
      setState({
        loading: false,
        session,
        profile,
        consented: !!consents.kvkk_aydinlatma && !!consents.acik_riza_konum,
      });
    } catch {
      setState({ loading: false, session, profile: null, consented: false });
    }
  }, []);

  const refresh = useCallback(async () => load(await api.getSession()), [load]);

  useEffect(() => {
    api.getSession().then(load);
    return api.onSessionChange((s) => {
      load(s);
    });
  }, [load]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

/**
 * Oturum durumuna göre gidilecek ekran. Açılış ekranı ve sekme grupları aynı kuralı kullanır.
 * Gruplar (`(musteri)`, `(kurye)`) URL'ye segment eklemediği için `/` bir grubun kendi ana sekmesine de
 * çözülebilir; bu yüzden gruplardan `/`'a değil, doğrudan buradaki hedefe yönlendirilir (aksi hâlde
 * çıkışta sonsuz yönlendirme döngüsü oluşur).
 */
export function entryRoute(s: Pick<SessionState, "session" | "consented" | "profile">) {
  if (!s.session) return "/giris" as const;
  if (!s.consented) return "/kvkk" as const;
  return s.profile?.role === "kurye" ? ("/(kurye)" as const) : ("/(musteri)" as const);
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider eksik");
  return v;
}
