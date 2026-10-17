"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

/** Copies a public value (a wallet address) and confirms it in place for two seconds. */
export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin or denied): the address stays selectable on the page.
    }
  }

  const Icon = copied ? Check : Copy
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy transition-colors hover:bg-brand-canvas focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  )
}
