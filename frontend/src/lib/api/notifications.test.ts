import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-access-token" } } }) },
  }),
}))

const { getNotifications, markNotificationRead, markAllNotificationsRead } = await import("./notifications")

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const sampleNotification = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "FRIEND_REQUEST" as const,
  readAt: null,
  createdAt: "2026-10-17T12:00:00.000Z",
  actor: {
    userId: "33333333-3333-4333-8333-333333333333",
    displayName: "Carlos S.",
  },
  friendRequestId: "44444444-4444-4444-8444-444444444444",
  invite: null,
}

describe("notifications client", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubEnv("BACKEND_API_URL", "http://backend.test")
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it("fetches notification list and unread count", async () => {
    fetchMock.mockResolvedValue(json(200, { unread: 1, items: [sampleNotification] }))
    const res = await getNotifications({ unreadOnly: true, limit: 10 })
    expect(res.unread).toBe(1)
    expect(res.items).toHaveLength(1)
    expect(res.items[0]?.kind).toBe("FRIEND_REQUEST")
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://backend.test/api/notifications?unread=true&limit=10")
  })

  it("marks a notification as read", async () => {
    fetchMock.mockResolvedValue(json(200, { ...sampleNotification, readAt: "2026-10-17T12:05:00.000Z" }))
    const res = await markNotificationRead(sampleNotification.id)
    expect(res.readAt).toBe("2026-10-17T12:05:00.000Z")
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe(`http://backend.test/api/notifications/${sampleNotification.id}/read`)
    expect(init?.method).toBe("POST")
  })

  it("marks all notifications as read", async () => {
    fetchMock.mockResolvedValue(json(200, { read: 3 }))
    const res = await markAllNotificationsRead()
    expect(res.read).toBe(3)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe("http://backend.test/api/notifications/read-all")
    expect(init?.method).toBe("POST")
  })
})
