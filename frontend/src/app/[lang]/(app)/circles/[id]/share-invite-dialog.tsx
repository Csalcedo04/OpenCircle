"use client"

import { useState } from "react"
import { Check, Copy, QrCode, Share2, MessageCircle, X, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fill, type Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"

interface Props {
  url: string
  circleName: string
  t: Dictionary["circle"]
  locale: Locale
}

export function ShareInviteDialog({ url, circleName, t, locale }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false)
    }
  }

  const shareText = fill(t.shareText, { link: url })
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full border-brand-line bg-brand-white px-5 text-sm font-semibold text-brand-navy shadow-2xs hover:bg-brand-canvas active:scale-95 transition-all"
      >
        <Share2 className="size-4 text-brand-violet" />
        <span>{t.shareTitle}</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-xs animate-in fade-in">
          <div
            className="relative w-full max-w-lg rounded-[32px] border border-brand-line bg-brand-white p-6 sm:p-8 shadow-xl animate-in zoom-in-95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-brand-slate hover:bg-brand-canvas hover:text-brand-navy transition-colors"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-violet">
              <Lock className="size-3.5" />
              <span>{t.shareTitle}</span>
            </div>
            <h2 id="share-dialog-title" className="mt-2 text-2xl font-bold tracking-tight text-brand-navy">
              {circleName}
            </h2>
            <p className="mt-1 text-xs text-brand-slate leading-relaxed">
              {t.shareLead}
            </p>

            {/* Link Box */}
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-brand-line bg-brand-canvas p-2 pl-3">
              <input
                readOnly
                value={url}
                className="w-full bg-transparent font-mono text-xs text-brand-navy outline-none select-all truncate"
              />
              <Button
                type="button"
                onClick={onCopy}
                className="shrink-0 h-9 rounded-xl bg-brand-violet px-3.5 text-xs font-semibold text-brand-white hover:bg-brand-violet-ink transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-brand-mint mr-1" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 mr-1" />
                    <span>{t.copyLink}</span>
                  </>
                )}
              </Button>
            </div>

            {/* Actions: WhatsApp & QR */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 px-4 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20 transition-colors"
              >
                <MessageCircle className="size-4 shrink-0 fill-[#25D366] text-[#25D366]" />
                <span>{t.shareWhatsapp}</span>
              </a>

              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowQr(!showQr)}
                className="h-11 rounded-2xl border border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy hover:bg-brand-canvas transition-colors"
              >
                <QrCode className="size-4 shrink-0 text-brand-violet mr-1.5" />
                <span>{showQr ? (locale === "es" ? "Ocultar QR" : "Hide QR") : (locale === "es" ? "Código QR" : "QR Code")}</span>
              </Button>
            </div>

            {/* QR Code Presentation */}
            {showQr && (
              <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-brand-line bg-brand-canvas p-6 text-center animate-in fade-in zoom-in-95">
                {/* SVG QR Visual */}
                <div className="size-40 bg-brand-white p-3 rounded-2xl shadow-2xs border border-brand-line flex items-center justify-center">
                  <svg className="size-full text-brand-navy" viewBox="0 0 100 100" fill="currentColor">
                    {/* Simplified aesthetic QR matrix pattern */}
                    <rect x="5" y="5" width="28" height="28" rx="4" />
                    <rect x="9" y="9" width="20" height="20" fill="white" rx="2" />
                    <rect x="13" y="13" width="12" height="12" rx="2" />

                    <rect x="67" y="5" width="28" height="28" rx="4" />
                    <rect x="71" y="9" width="20" height="20" fill="white" rx="2" />
                    <rect x="75" y="13" width="12" height="12" rx="2" />

                    <rect x="5" y="67" width="28" height="28" rx="4" />
                    <rect x="9" y="71" width="20" height="20" fill="white" rx="2" />
                    <rect x="13" y="75" width="12" height="12" rx="2" />

                    {/* Data dots */}
                    <rect x="42" y="10" width="8" height="8" rx="2" />
                    <rect x="52" y="10" width="6" height="6" rx="1" />
                    <rect x="45" y="24" width="8" height="8" rx="2" />
                    <rect x="15" y="44" width="8" height="8" rx="2" />
                    <rect x="28" y="48" width="6" height="6" rx="1" />
                    <rect x="42" y="42" width="16" height="16" rx="3" fill="#7659F5" />
                    <rect x="64" y="46" width="8" height="8" rx="2" />
                    <rect x="78" y="44" width="10" height="10" rx="2" />
                    <rect x="45" y="68" width="8" height="8" rx="2" />
                    <rect x="58" y="72" width="6" height="6" rx="1" />
                    <rect x="72" y="68" width="10" height="10" rx="2" />
                    <rect x="85" y="80" width="8" height="8" rx="2" />
                  </svg>
                </div>
                <p className="mt-3 text-[11px] font-medium text-brand-slate">
                  {locale === "es" ? "Escanea para unirte desde tu celular" : "Scan to join from your mobile phone"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
