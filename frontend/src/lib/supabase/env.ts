import { z } from "zod"

/**
 * Supabase config validated at first use. The URL and publishable key are
 * public by design (RLS guards the data); the secret key is read only in
 * `admin.ts`, which is `server-only`.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced literally so Next inlines
 * them into the browser bundle.
 */
const publicSchema = z.object({
  url: z.url(),
  publishableKey: z.string().startsWith("sb_publishable_"),
})

export type SupabasePublicEnv = z.infer<typeof publicSchema>

let cached: SupabasePublicEnv | undefined

export function supabasePublicEnv(): SupabasePublicEnv {
  cached ??= publicSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  return cached
}

/**
 * True when the public Supabase env is present and valid. Lets the app run
 * (a fresh clone, a preview deploy) without Supabase configured.
 */
export function isSupabaseConfigured(): boolean {
  try {
    supabasePublicEnv()
    return true
  } catch {
    return false
  }
}
