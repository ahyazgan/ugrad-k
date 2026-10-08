// Özel isimlere Türkçe ek getirme (ünlü uyumu + ünsüz benzeşmesi): Kadıköy'de, Kartal'da, Beşiktaş'ta.

type Case = "locative" | "ablative" | "dative" | "genitive";

const VOWELS = "aeıioöuü";
const HARD = "fstkçşhp"; // fıstıkçı şahap
const FRONT = "eiöü";

/** Tamlama eki almış birleşik adlar (Beyoğlu → Beyoğlu'nda) */
const POSSESSIVE = new Set(["Beyoğlu"]);

function lastVowel(word: string): string {
  const w = word.toLocaleLowerCase("tr-TR");
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i]!)) return w[i]!;
  return "e";
}

export function suffix(name: string, c: Case): string {
  const v = lastVowel(name);
  const front = FRONT.includes(v);
  const a = front ? "e" : "a"; // iki yönlü
  const i = v === "a" || v === "ı" ? "ı" : v === "e" || v === "i" ? "i" : v === "o" || v === "u" ? "u" : "ü"; // dört yönlü
  const last = name.toLocaleLowerCase("tr-TR").slice(-1);
  const endsVowel = VOWELS.includes(last);
  const hard = HARD.includes(last);
  if (POSSESSIVE.has(name)) {
    return name + "'" + { locative: `nd${a}`, ablative: `nd${a}n`, dative: `n${a}`, genitive: `n${i}n` }[c];
  }
  switch (c) {
    case "locative":
      return `${name}'${hard ? "t" : "d"}${a}`;
    case "ablative":
      return `${name}'${hard ? "t" : "d"}${a}n`;
    case "dative":
      return `${name}'${endsVowel ? "y" : ""}${a}`;
    case "genitive":
      return `${name}'${endsVowel ? "n" : ""}${i}n`;
  }
}
