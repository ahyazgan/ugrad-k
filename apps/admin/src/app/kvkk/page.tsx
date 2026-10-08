import { AYDINLATMA_METNI } from "@yazgan/shared/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni — Yazgan Kurye" };

export default function Page() {
  return <LegalPage title="KVKK aydınlatma metni">{AYDINLATMA_METNI}</LegalPage>;
}
