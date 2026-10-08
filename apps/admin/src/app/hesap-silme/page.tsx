import { HESAP_SILME } from "@yazgan/shared/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Hesap Silme — Yazgan Kurye" };

export default function Page() {
  return <LegalPage title="Hesap silme">{HESAP_SILME}</LegalPage>;
}
