import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for GNAP tokens at rest. Output: `v1.<iv>.<tag>.<ciphertext>`, each base64url.
 * A tampered value or a wrong key fails to decrypt instead of returning garbage.
 */
export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(sealed: string): string;
}

export function createTokenCipher(base64Key: string): TokenCipher {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Token key must be 32 bytes");

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return ["v1", iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
    },
    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split(".");
      if (version !== "v1" || !iv || !tag || ciphertext === undefined) throw new Error("Malformed sealed token");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}
