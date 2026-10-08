import { describe, expect, it } from "vitest";
import { generateApiKey, generateWebhookSecret, keyPrefix, sha256Hex } from "../src/lib/api-keys";

describe("API anahtarı", () => {
  it("biçim ve benzersizlik", () => {
    const a = generateApiKey();
    expect(a).toMatch(/^yk_live_[A-Za-z0-9]{32}$/);
    expect(generateApiKey()).not.toBe(a);
    expect(keyPrefix(a)).toBe(a.slice(0, 12));
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9]{32}$/);
  });
  it("SHA-256 (sunucuyla aynı özet)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
