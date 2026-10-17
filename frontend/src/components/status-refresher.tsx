"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type Props = {
  /** How often to re-render the page (each refresh re-reads the status from the API). */
  intervalMs?: number
  /** Stop after this long; a reload starts again. */
  maxMs?: number
}

/**
 * While something settles elsewhere (a payment arriving, a verification deciding), re-renders
 * the server page every few seconds. Pauses in background tabs.
 */
export function StatusRefresher({ intervalMs = 5_000, maxMs = 10 * 60_000 }: Props) {
  const router = useRouter()

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => {
      if (Date.now() - startedAt > maxMs) return clearInterval(id)
      if (document.visibilityState === "visible") router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs, maxMs])

  return null
}
