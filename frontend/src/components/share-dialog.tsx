"use client"

import { useState } from "react"
import { Check, Copy, MessageCircle, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { fill } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { cn } from "@/lib/utils"

type Props = {
  url: string
  circleName: string
  t: Dictionary["share"]
  /** Smaller trigger, for a row in a list. */
  compact?: boolean | undefined
}

/** Copy a link or send it by WhatsApp. */
export function ShareDialog({ url, circleName, t, compact = false }: Props) {
  const [copied, setCopied] = useState(false)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(fill(t.text, { circle: circleName, link: url }))}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link stays selectable in the field.
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-white font-semibold text-brand-navy shadow-2xs transition-all hover:bg-brand-canvas active:scale-95",
          compact ? "h-9 px-3.5 text-xs" : "h-11 px-5 text-sm",
        )}
      >
        <Share2 className={cn("text-brand-violet", compact ? "size-3.5" : "size-4")} aria-hidden="true" />
        <span>{t.title}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogClose className="absolute top-5 right-5 rounded-full p-2 text-brand-slate transition-colors hover:bg-brand-canvas hover:text-brand-navy" aria-label={t.close}>
          <X className="size-5" aria-hidden="true" />
        </DialogClose>
        <p className="text-xs font-semibold text-brand-violet-ink">{t.title}</p>
        <DialogTitle className="mt-2 pr-10">{circleName}</DialogTitle>
        <DialogDescription>{t.lead}</DialogDescription>

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-brand-line bg-brand-canvas p-2 pl-3">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t.linkLabel} className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-brand-navy outline-none" />
          <Button type="button" onClick={copy} className="h-9 shrink-0 rounded-xl bg-brand-violet px-3.5 text-xs font-semibold text-brand-white hover:bg-brand-violet-ink">
            {copied ? <Check className="size-3.5 text-brand-mint" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            <span>{copied ? t.copied : t.copy}</span>
          </Button>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? t.copied : ""}
        </span>

        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy transition-colors hover:bg-brand-canvas"
        >
          <MessageCircle className="size-4 shrink-0 text-brand-violet-ink" aria-hidden="true" />
          <span>{t.whatsapp}</span>
        </a>
      </DialogContent>
    </Dialog>
  )
}
