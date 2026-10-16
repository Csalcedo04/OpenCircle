"use client"

import { useEffect, useRef } from "react"
import { CheckCircle2, Cpu, X } from "lucide-react"
import type { LandingDictionary } from "@/i18n/dictionaries/landing.es"

type FaqItem = LandingDictionary["faq"]["items"][number]

interface FaqModalProps {
  item: FaqItem | null
  onClose: () => void
  modalBadge: string
  modalClose: string
  technicalNoteLabel: string
}

export function FaqModal({
  item,
  onClose,
  modalBadge,
  modalClose,
  technicalNoteLabel,
}: FaqModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!item) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    // Focus the modal container
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [item, onClose])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog / Mobile Bottom Sheet */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-[32px] border border-brand-line bg-brand-white p-6 shadow-2xl outline-none animate-in slide-in-from-bottom-8 duration-200 sm:rounded-[36px] sm:p-8 sm:zoom-in-95"
      >
        {/* Drag handle for mobile */}
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-brand-line sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mist px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy">
              <span className="size-2 rounded-full bg-brand-violet" />
              {item.tag || modalBadge}
            </span>
            <h3 id="faq-modal-title" className="text-xl font-bold tracking-[-0.02em] text-brand-navy sm:text-2xl">
              {item.q}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={modalClose}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-mist text-brand-navy transition-colors hover:bg-brand-line focus-visible:ring-2 focus-visible:ring-brand-violet"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Executive summary */}
        <p className="mt-4 text-base leading-relaxed text-brand-slate sm:text-lg">
          {item.summary}
        </p>

        {/* Key architecture points */}
        <div className="mt-6 space-y-2.5 rounded-2xl border border-brand-line bg-brand-mist/50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-slate">
            {modalBadge}
          </p>
          <ul className="space-y-2 text-sm text-brand-navy">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-violet" />
              <span>{item.bullet1}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-violet" />
              <span>{item.bullet2}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-violet" />
              <span>{item.bullet3}</span>
            </li>
          </ul>
        </div>

        {/* Technical protocol specification */}
        <div className="mt-4 rounded-2xl border border-brand-line bg-brand-canvas p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-brand-violet-ink">
            <Cpu className="size-4 text-brand-violet" />
            <span>{technicalNoteLabel}</span>
          </div>
          <p className="mt-2 font-mono text-xs leading-relaxed text-brand-navy/90 sm:text-[13px]">
            {item.technicalNote}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-brand-navy px-6 py-2.5 text-center text-sm font-semibold text-brand-white transition-opacity hover:opacity-90 sm:w-auto"
          >
            {modalClose}
          </button>
        </div>
      </div>
    </div>
  )
}
