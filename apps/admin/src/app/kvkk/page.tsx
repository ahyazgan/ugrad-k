import { AYDINLATMA_METNI } from "@yazgan/shared/legal";
import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: `KVKK Aydınlatma Metni — ${BRAND.name}` };

export default function Page() {
  return <LegalPage title="KVKK aydınlatma metni">{AYDINLATMA_METNI}</LegalPage>;
}
