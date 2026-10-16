import "server-only"

import { circles, members, reviews } from "@/lib/mock/data"
import type { Circle, Member, Review } from "@/lib/domain/types"

/**
 * Read API for pages. Backed by demo data today; swap these bodies for the
 * backend (Prisma / route handlers) without touching the UI.
 */

export async function listCircles(): Promise<Circle[]> {
  return circles
}

export async function getCircle(id: string): Promise<Circle | undefined> {
  return circles.find((c) => c.id === id)
}

export async function listMembers(): Promise<Member[]> {
  return members
}

export async function getMember(id: string): Promise<Member | undefined> {
  return members.find((m) => m.id === id)
}

export async function listReviews(): Promise<Review[]> {
  return reviews
}

export async function circlesForMember(id: string): Promise<Circle[]> {
  return circles.filter((c) => c.seats.some((s) => s.memberId === id))
}
