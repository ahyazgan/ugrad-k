import type { MetadataRoute } from "next";
import { DISTRICTS } from "@/lib/districts";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<[string, number]> = [
    ["/", 1],
    ["/fiyatlar", 0.9],
    ["/kurumsal", 0.9],
    ["/hizmet-bolgeleri", 0.8],
    ["/sss", 0.6],
    ["/iletisim", 0.6],
    ["/kurye-ol", 0.5],
    ["/api-belgeleri", 0.4],
    ["/kvkk", 0.2],
    ["/gizlilik", 0.2],
  ];
  return [
    ...pages.map(([p, priority]) => ({ url: absoluteUrl(p), changeFrequency: "monthly" as const, priority })),
    ...DISTRICTS.map((d) => ({ url: absoluteUrl(`/hizmet-bolgeleri/${d.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
