"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const INTERVAL_MS = 5_000
const MAX_MS = 10 * 60_000

/**
 * While Didit is still deciding, re-renders the gate every few seconds. Each
 * refresh reads the status from the API, which asks Didit for the decision.
 * Pauses in background tabs and stops after a while; a reload starts it again.
 */
export function KycStatusRefresher() {
  const router = useRouter()

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => {
      if (Date.now() - startedAt > MAX_MS) return clearInterval(id)
      if (document.visibilityState === "visible") router.refresh()
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
