import { GIZLILIK_POLITIKASI } from "@yazgan/shared/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Gizlilik Politikası — Yazgan Kurye" };

export default function Page() {
  return <LegalPage title="Gizlilik politikası">{GIZLILIK_POLITIKASI}</LegalPage>;
}
