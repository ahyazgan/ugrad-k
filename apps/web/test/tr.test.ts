import { describe, expect, it } from "vitest";
import { suffix } from "../src/lib/tr";

describe("Türkçe ekler", () => {
  it.each([
    ["Kadıköy", "Kadıköy'de", "Kadıköy'den", "Kadıköy'e", "Kadıköy'ün"],
    ["Kartal", "Kartal'da", "Kartal'dan", "Kartal'a", "Kartal'ın"],
    ["Beşiktaş", "Beşiktaş'ta", "Beşiktaş'tan", "Beşiktaş'a", "Beşiktaş'ın"],
    ["Pendik", "Pendik'te", "Pendik'ten", "Pendik'e", "Pendik'in"],
    ["Ümraniye", "Ümraniye'de", "Ümraniye'den", "Ümraniye'ye", "Ümraniye'nin"],
    ["Tuzla", "Tuzla'da", "Tuzla'dan", "Tuzla'ya", "Tuzla'nın"],
    ["Beykoz", "Beykoz'da", "Beykoz'dan", "Beykoz'a", "Beykoz'un"],
    ["Beyoğlu", "Beyoğlu'nda", "Beyoğlu'ndan", "Beyoğlu'na", "Beyoğlu'nun"],
  ])("%s", (n, loc, abl, dat, gen) => {
    expect([suffix(n, "locative"), suffix(n, "ablative"), suffix(n, "dative"), suffix(n, "genitive")]).toEqual([loc, abl, dat, gen]);
  });
});
