import type { RingSeat } from "@/components/circle-ring"
import { initials } from "@/components/trust"
import type { Locale } from "@/i18n/config"
import type { Circle, Member, Round } from "@/lib/domain/types"

/** Seats around the ring, in payout order, for one round. */
export function ringSeats(circle: Circle, round: Round | undefined, byId: Map<string, Member>): RingSeat[] {
  return [...circle.seats]
    .sort((a, b) => a.payoutRound - b.payoutRound)
    .map((seat) => {
      const name = byId.get(seat.memberId)?.name ?? seat.memberId
      const status = round?.contributions.find((c) => c.memberId === seat.memberId)?.status
      return {
        id: seat.memberId,
        initials: initials(name),
        label: name,
        state: status === "VERIFIED" ? "verified" : "pending",
        beneficiary: Boolean(round?.beneficiaryId && round.beneficiaryId === seat.memberId),
      }
    })
}

export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d)
}

export function formatBps(bps: number, locale: Locale): string {
  const whole = Math.floor(bps / 100)
  const frac = bps % 100
  return frac === 0 ? `${whole}%` : `${whole}${locale === "es" ? "," : "."}${String(frac).padStart(2, "0")}%`
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}
