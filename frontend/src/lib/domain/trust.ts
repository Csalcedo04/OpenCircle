import type { Member, Review } from "./types"

export type TrustSummary = {
  /** 0–100. 70% on-time payment rate, 30% average review rating. */
  score: number
  onTimeRate: number
  reviewCount: number
  /** Average rating ×10 as an integer (e.g. 46 = 4.6 stars). */
  ratingTenths: number
  level: "NEW" | "BUILDING" | "TRUSTED" | "EXEMPLARY"
}

export function trustFor(member: Member, reviews: readonly Review[]): TrustSummary {
  const received = reviews.filter((r) => r.subjectId === member.id)
  const { onTime, late, missed } = member.payments
  const total = onTime + late + missed
  const onTimeRate = total === 0 ? 0 : Math.floor((onTime * 100) / total)
  const stars = received.reduce((acc, r) => acc + r.rating, 0)
  const ratingTenths = received.length === 0 ? 0 : Math.round((stars * 10) / received.length)
  // Rating 1–5 mapped to 0–100 before weighting.
  const ratingScore = received.length === 0 ? onTimeRate : Math.round(((ratingTenths - 10) * 100) / 40)
  const score = total === 0 ? 0 : Math.round((onTimeRate * 70 + ratingScore * 30) / 100)
  const level = total < 3 ? "NEW" : score >= 90 ? "EXEMPLARY" : score >= 75 ? "TRUSTED" : "BUILDING"
  return { score, onTimeRate, reviewCount: received.length, ratingTenths, level }
}
