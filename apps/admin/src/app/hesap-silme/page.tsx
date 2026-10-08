import { HESAP_SILME } from "@yazgan/shared/legal";
import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: `Hesap Silme — ${BRAND.name}` };

export default function Page() {
  return <LegalPage title="Hesap silme">{HESAP_SILME}</LegalPage>;
}
