import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: `Gönderi takibi — ${BRAND.name}`,
  robots: { index: false, follow: false },
};

export default function TakipLayout({ children }: { children: ReactNode }) {
  return children;
}
