import { exportJWK, generateKeyPair, SignJWT } from "jose";

const KID = "test-signing-key";

export interface TokenOptions {
  // Seconds since epoch; defaults to one hour from now.
  expiresAt?: number;
  // Sign with a key that is not in the JWKS.
  foreignKey?: boolean;
  // Omit the "kid" header (legacy-style token).
  withoutKid?: boolean;
  // Email claim; defaults to <sub>@example.test, null omits it (e.g. a phone-only account).
  email?: string | null;
}

export interface TestAuth {
  token(sub: string, options?: TokenOptions): Promise<string>;
}

// Publishes a throwaway ES256 key as the inline JWKS that @supabase/server verifies against,
// so tests exercise the real JWT verification without Supabase Auth or network calls.
export async function setupTestAuth(): Promise<TestAuth> {
  const [trusted, foreign] = await Promise.all([generateKeyPair("ES256"), generateKeyPair("ES256")]);
  const jwk = { ...(await exportJWK(trusted.publicKey)), kid: KID, alg: "ES256", use: "sig" };

  // Inline JWKS wins over SUPABASE_JWKS_URL or a JWKS derived from SUPABASE_URL in .env.
  process.env.SUPABASE_JWKS = JSON.stringify({ keys: [jwk] });
  process.env.SUPABASE_URL ??= "https://example.supabase.co";

  return {
    token(sub, options = {}) {
      const now = Math.floor(Date.now() / 1000);
      const email = options.email === undefined ? `${sub}@example.test` : options.email;
      return new SignJWT({ role: "authenticated", ...(email === null ? {} : { email }) })
        .setProtectedHeader(options.withoutKid ? { alg: "ES256" } : { alg: "ES256", kid: KID })
        .setSubject(sub)
        .setAudience("authenticated")
        .setIssuedAt(now - 120)
        .setExpirationTime(options.expiresAt ?? now + 3600)
        .sign(options.foreignKey ? foreign.privateKey : trusted.privateKey);
    },
  };
}
