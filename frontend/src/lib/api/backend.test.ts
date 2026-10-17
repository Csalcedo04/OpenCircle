import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The real client, with only its edges faked: the server-only marker, the Supabase session and fetch.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-access-token" } } }) },
  }),
}))

const { BackendError, fetchCircle, getMyProfile, isBackendUnavailable, isFeatureUnavailable } = await import("./backend")

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.test",
  documentType: "cc",
  documentNumber: "1023456789",
  nationality: "CO",
  fullName: "Ana Gómez",
  phone: "+573001234567",
  dob: "1995-04-12",
  walletAddress: null,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function failure(): Promise<InstanceType<typeof BackendError>> {
  try {
    await getMyProfile()
  } catch (err) {
    if (err instanceof BackendError) return err
    throw err
  }
  throw new Error("expected getMyProfile to fail")
}

describe("backend client", () => {
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

  it("sends the Supabase access token and parses the profile", async () => {
    fetchMock.mockResolvedValue(json(200, profile))
    // An API deploy without internal accounts omits the field: it reads as "none".
    await expect(getMyProfile()).resolves.toEqual({ ...profile, internalAccount: null })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe("http://backend.test/api/users/me")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access-token")
  })

  it("parses the internal account when the API reports one", async () => {
    const internalAccount = { id: "22222222-2222-4222-8222-222222222222", balance: { value: "5000000", assetCode: "COP", assetScale: 2 } }
    fetchMock.mockResolvedValue(json(200, { ...profile, internalAccount }))
    await expect(getMyProfile()).resolves.toEqual({ ...profile, internalAccount })
  })

  it("returns null for a user without a profile", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "PROFILE_NOT_FOUND", message: "User profile not found" } }))
    await expect(getMyProfile()).resolves.toBeNull()
  })

  it("is 'unavailable' when BACKEND_API_URL is missing, without calling anything", async () => {
    vi.stubEnv("BACKEND_API_URL", "")
    const err = await failure()
    expect(isBackendUnavailable(err)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("is 'unavailable' when the connection fails or times out", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    expect(isBackendUnavailable(await failure())).toBe(true)
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"))
    expect(isBackendUnavailable(await failure())).toBe(true)
  })

  it("is 'unavailable' when a gateway answers 502/503/504 for a backend that's down", async () => {
    for (const status of [502, 503, 504]) {
      fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status }))
      expect(isBackendUnavailable(await failure()), String(status)).toBe(true)
    }
  })

  it("keeps the API's own error codes, including its own 503s", async () => {
    fetchMock.mockResolvedValue(json(503, { error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook not configured" } }))
    const own = await failure()
    expect(own.code).toBe("WEBHOOK_NOT_CONFIGURED")
    expect(isBackendUnavailable(own)).toBe(false)

    fetchMock.mockResolvedValue(json(500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } }))
    expect((await failure()).code).toBe("INTERNAL_ERROR")
  })

  it("distinguishes 404 NOT_FOUND (missing route on older server) from resource 404s", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "NOT_FOUND", message: "Route not found" } }))
    const missingRoute = await failure()
    expect(isFeatureUnavailable(missingRoute)).toBe(true)

    expect(isFeatureUnavailable(new BackendError(404, "CIRCLE_NOT_FOUND", "Circle not found"))).toBe(false)
    expect(isFeatureUnavailable(new BackendError(503, "BACKEND_UNAVAILABLE", "Down"))).toBe(false)
  })

  it("applies safe defaults when an older backend omits governance fields on a circle", async () => {
    const circleId = "22222222-2222-4222-8222-222222222222"
    fetchMock.mockResolvedValue(
      json(200, {
        id: circleId,
        name: "Natillera Centro",
        city: null,
        status: "OPEN",
        contribution: { value: "2000000", assetCode: "COP", assetScale: 2 },
        size: 4,
        seatsTaken: 1,
        cadence: "MONTHLY",
        createdAt: "2026-10-01T00:00:00.000Z",
        feeBps: 200,
        threshold: { value: "1000000", assetCode: "COP", assetScale: 2 },
        grantWeightBps: 5000,
        poolWalletAddress: "https://ilp.interledger-test.dev/pool",
        startedAt: null,
        currentRound: null,
        seats: [
          {
            memberId: "33333333-3333-4333-8333-333333333333",
            userId: "11111111-1111-4111-8111-111111111111",
            displayName: "Ana G.",
            payoutRound: 1,
            collateral: { value: "0", assetCode: "COP", assetScale: 2 },
            grantMode: "RECURRING",
            record: {
              payments: { onTime: 1, late: 0, missed: 0 },
              ratings: { count: 0, tenths: 0 },
              circlesCompleted: 0,
              memberSince: "2026-10-01T00:00:00.000Z",
            },
          },
        ],
        rounds: [],
        reviews: [],
      }),
    )
    const dto = await fetchCircle(circleId)
    expect(dto?.payoutOrder).toBe("BEST_SCORE_FIRST")
    expect(dto?.approvalMode).toBe("DELEGATES")
    expect(dto?.visibility).toBe("PUBLIC")
    expect(dto?.seats[0]?.isApprover).toBe(false)
    expect(dto?.access).toEqual({ canInvite: false, isCreator: false, isMember: false, canVote: false })
  })

  it("parses circles whose pre-generated rounds have beneficiaryMemberId: null", async () => {
    const circleId = "22222222-2222-4222-8222-222222222222"
    fetchMock.mockResolvedValue(
      json(200, {
        id: circleId,
        name: "Círculo Abierto",
        city: null,
        status: "OPEN",
        contribution: { value: "2000000", assetCode: "COP", assetScale: 2 },
        size: 4,
        seatsTaken: 1,
        cadence: "MONTHLY",
        payoutOrder: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        feeBps: 200,
        threshold: { value: "1000000", assetCode: "COP", assetScale: 2 },
        grantWeightBps: 5000,
        poolWalletAddress: "https://ilp.interledger-test.dev/pool",
        startedAt: null,
        currentRound: null,
        seats: [
          {
            memberId: "33333333-3333-4333-8333-333333333333",
            userId: "11111111-1111-4111-8111-111111111111",
            displayName: "Ana G.",
            payoutRound: null,
            collateral: { value: "0", assetCode: "COP", assetScale: 2 },
            grantMode: "RECURRING",
            record: {
              payments: { onTime: 1, late: 0, missed: 0 },
              ratings: { count: 0, tenths: 0 },
              circlesCompleted: 0,
              memberSince: "2026-10-01T00:00:00.000Z",
            },
            isApprover: null,
          },
        ],
        rounds: [1, 2, 3, 4].map((number) => ({
          number,
          state: "UPCOMING",
          beneficiaryMemberId: null,
          startsAt: null,
          deadline: `2026-1${number}-01T00:00:00.000Z`,
          contributions: [],
        })),
        reviews: null,
        visibility: null,
        approvalMode: null,
        inviteUrl: null,
        access: null,
      }),
    )
    const dto = await fetchCircle(circleId)
    expect(dto?.rounds).toHaveLength(4)
    expect(dto?.rounds.map((r) => r.beneficiaryMemberId)).toEqual([null, null, null, null])
    expect(dto?.seats[0]?.payoutRound).toBeNull()
    expect(dto?.payoutOrder).toBe("BEST_SCORE_FIRST")
  })
})
