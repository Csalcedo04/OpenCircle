import "server-only"

import { z } from "zod"
import { backendFetch } from "@/lib/api/backend"

// Friends (see backend routes/friends.ts): requests by email or by a visible user's id, accepted
// by the addressee. Rejecting, withdrawing or removing just deletes the relationship.

const personSchema = z.object({ userId: z.uuid(), displayName: z.string() })
const friendSchema = personSchema.extend({ since: z.string() })
const friendRequestSchema = z.object({ id: z.uuid(), from: personSchema, to: personSchema, createdAt: z.string() })
const requestsSchema = z.object({ incoming: z.array(friendRequestSchema), outgoing: z.array(friendRequestSchema) })

export type FriendDto = z.infer<typeof friendSchema>
export type FriendRequestDto = z.infer<typeof friendRequestSchema>
export type FriendRequestsDto = z.infer<typeof requestsSchema>
export type FriendTarget = { userId: string } | { email: string }

export function getFriends(): Promise<FriendDto[]> {
  return backendFetch("/friends", z.array(friendSchema))
}

export function getFriendRequests(): Promise<FriendRequestsDto> {
  return backendFetch("/friends/requests", requestsSchema)
}

export function sendFriendRequest(target: FriendTarget): Promise<FriendRequestDto> {
  return backendFetch("/friends/requests", friendRequestSchema, { method: "POST", body: JSON.stringify(target) })
}

export function acceptFriendRequest(requestId: string): Promise<FriendDto> {
  return backendFetch(`/friends/requests/${encodeURIComponent(requestId)}/accept`, friendSchema, { method: "POST" })
}

/** Rejects (as the addressee) or withdraws (as the requester). */
export function cancelFriendRequest(requestId: string): Promise<void> {
  return backendFetch(`/friends/requests/${encodeURIComponent(requestId)}`, z.unknown(), { method: "DELETE" }).then(() => undefined)
}

export function removeFriend(userId: string): Promise<void> {
  return backendFetch(`/friends/${encodeURIComponent(userId)}`, z.unknown(), { method: "DELETE" }).then(() => undefined)
}
