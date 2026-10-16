/**
 * Public base URL for canonical links, Open Graph, sitemap and robots.
 * Set NEXT_PUBLIC_SITE_URL in production; Vercel's production URL is the fallback.
 */
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
)

export const REPO_URL = "https://github.com/Csalcedo04/OpenCircle"
