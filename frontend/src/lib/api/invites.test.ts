import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-access-token" } } }) },
  }),
}))

const { getCircleInvites, revokeCircleInvite } = await import("./invites")

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const base = {
  circleId: "11111111-1111-4111-8111-111111111111",
  status: "ACTIVE",
  createdAt: "2026-10-17T00:00:00.000Z",
  expiresAt: null,
  createdByName: "Ana G.",
}
const code = { ...base, id: "22222222-2222-4222-8222-222222222222", kind: "CODE", inviteUrl: "http://app.test/es/circles/x?invite=tok", uses: 1, maxUses: null }
const direct = { ...base, id: "33333333-3333-4333-8333-333333333333", kind: "DIRECT", invitee: { userId: null, displayName: null, email: "bob@example.test" } }

describe("invites client", () => {
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

  it("parses codes and direct invites by kind", async () => {
    fetchMock.mockResolvedValue(json(200, [code, direct]))
    const invites = await getCircleInvites(base.circleId)
    expect(invites).toEqual([code, direct])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://backend.test/api/circles/${base.circleId}/invites`)
  })

  it("revokes with DELETE and the bearer token", async () => {
    fetchMock.mockResolvedValue(json(200, { ...code, status: "REVOKED" }))
    await expect(revokeCircleInvite(base.circleId, code.id)).resolves.toMatchObject({ status: "REVOKED" })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe(`http://backend.test/api/circles/${base.circleId}/invites/${code.id}`)
    expect(init?.method).toBe("DELETE")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access-token")
  })
})
