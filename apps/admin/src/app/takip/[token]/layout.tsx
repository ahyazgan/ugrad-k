import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gönderi takibi — Yazgan Kurye",
  robots: { index: false, follow: false },
};

export default function TakipLayout({ children }: { children: ReactNode }) {
  return children;
}
