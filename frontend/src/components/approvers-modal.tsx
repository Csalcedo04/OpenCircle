"use client"

import { useActionState, useState } from "react"
import { Check, CheckCircle2, LoaderCircle, ShieldCheck, UserCheck, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Locale } from "@/i18n/config"
import type { Dictionary } from "@/i18n/dictionaries/en"
import { setCircleApproversAction, type ApproversState } from "@/lib/actions/circle-applications"
import type { Seat } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

interface ApproversModalProps {
  locale: Locale
  circleId: string
  seats: Seat[]
  creatorUserId?: string | undefined
  t: Dictionary["circle"]
  tErr: Dictionary["circleErrors"]
}

const EMPTY_STATE: ApproversState = { error: null, saved: false }

export function ApproversModal({ locale, circleId, seats, creatorUserId, t, tErr }: ApproversModalProps) {
  const [open, setOpen] = useState(false)

  const creatorSeat = creatorUserId ? seats.find((s) => s.memberId === creatorUserId) : undefined
  const eligibleSeats = seats.filter((s) => Boolean(s.seatId) && s.memberId !== creatorUserId)

  const initialSelected = () =>
    eligibleSeats.filter((s) => s.isApprover && s.seatId).map((s) => s.seatId!)

  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>(initialSelected)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedSeatIds(initialSelected())
    }
    setOpen(nextOpen)
  }

  const [state, formAction, pending] = useActionState<ApproversState, FormData>(
    async () => {
      const result = await setCircleApproversAction(locale, circleId, selectedSeatIds)
      if (result.saved) {
        setTimeout(() => setOpen(false), 1200)
      }
      return result
    },
    EMPTY_STATE,
  )

  const toggleSeat = (seatId: string) => {
    setSelectedSeatIds((prev) =>
      prev.includes(seatId) ? prev.filter((id) => id !== seatId) : [...prev, seatId],
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1.5 text-xs font-semibold text-brand-violet-ink transition-[background-color,transform] hover:bg-brand-violet/20 active:scale-95">
        <UserCheck className="size-3.5 text-brand-violet" aria-hidden="true" />
        <span>{t.manageApprovers}</span>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/20 bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet-ink">
              <Users className="size-3.5 text-brand-violet" aria-hidden="true" />
              <span>{t.approversTitle}</span>
            </div>
            <DialogTitle className="mt-2 text-xl font-bold tracking-tight text-brand-navy">
              {t.approversTitle}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-brand-slate">
              {t.approversLead}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t.approversCancel}
            className="rounded-full p-1.5 text-brand-slate transition-colors hover:bg-brand-canvas hover:text-brand-navy"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        {state.saved && (
          <div role="status" className="oc-fade-in mt-4 flex items-center gap-2 rounded-xl bg-brand-mint/40 p-3 text-xs font-semibold text-brand-navy">
            <CheckCircle2 className="size-4 shrink-0 text-brand-navy" />
            <span>{t.approversSuccess}</span>
          </div>
        )}

        {state.error && (
          <p role="alert" className="oc-fade-in mt-4 rounded-xl bg-brand-mist p-3 text-xs font-medium text-brand-violet-ink">
            {tErr[state.error]}
          </p>
        )}

        <form action={formAction} className="mt-5 space-y-4">
          {creatorSeat && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-line bg-brand-canvas p-3.5 text-xs">
              <div className="flex min-w-0 items-center gap-2.5">
                <ShieldCheck className="size-4 shrink-0 text-brand-violet" aria-hidden="true" />
                <span className="truncate font-semibold text-brand-navy">
                  {creatorSeat.displayName ?? creatorSeat.memberId}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-brand-mint px-2.5 py-0.5 text-[10px] font-bold text-brand-navy">
                {t.approverCreatorBadge}
              </span>
            </div>
          )}

          {eligibleSeats.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-line p-6 text-center text-xs text-brand-slate">
              {t.noEligibleApprovers}
            </p>
          ) : (
            <ul className="space-y-2">
              {eligibleSeats.map((s) => {
                const seatId = s.seatId!
                const isSelected = selectedSeatIds.includes(seatId)
                return (
                  <li key={seatId}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs transition-all active:scale-[0.98]",
                        isSelected
                          ? "border-brand-violet bg-brand-violet/5 ring-1 ring-brand-violet"
                          : "border-brand-line bg-brand-canvas hover:border-brand-navy/30",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSeat(seatId)}
                          className="size-4 rounded accent-brand-violet"
                        />
                        <span className="truncate font-semibold text-brand-navy">
                          {s.displayName ?? s.memberId}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="shrink-0 rounded-full bg-brand-violet/10 px-2 py-0.5 text-[10px] font-bold text-brand-violet">
                          {t.approverBadge}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <DialogClose className="inline-flex h-10 items-center justify-center rounded-full border border-brand-line bg-brand-white px-4 text-xs font-semibold text-brand-navy hover:bg-brand-canvas active:scale-95">
              {t.approversCancel}
            </DialogClose>
            <Button
              type="submit"
              disabled={pending || eligibleSeats.length === 0}
              className="h-10 rounded-full bg-brand-violet px-5 text-xs font-semibold text-brand-white hover:bg-brand-violet-ink active:scale-95"
            >
              {pending ? (
                <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{pending ? t.approversSaving : t.approversSave}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
