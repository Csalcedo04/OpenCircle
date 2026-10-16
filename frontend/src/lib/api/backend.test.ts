import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The real client, with only its edges faked: the server-only marker, the Supabase session and fetch.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-access-token" } } }) },
  }),
}))

const { BackendError, getMyProfile, isBackendUnavailable } = await import("./backend")

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
    await expect(getMyProfile()).resolves.toEqual(profile)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe("http://backend.test/api/users/me")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access-token")
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
})
