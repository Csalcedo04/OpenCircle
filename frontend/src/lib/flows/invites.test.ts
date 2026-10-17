import { describe, expect, it } from "vitest"
import { inviteErrorKey, inviteeLabel, parseCodeInviteForm, parseDirectInviteForm, splitEmails } from "./invites"

describe("parseCodeInviteForm", () => {
  it("turns the expiry preset into hours and an empty limit into unlimited", () => {
    expect(parseCodeInviteForm({ expiry: "24h", maxUses: "" })).toEqual({ ok: true, request: { kind: "CODE", expiresInHours: 24, maxUses: null } })
    expect(parseCodeInviteForm({ expiry: "7d", maxUses: " 5 " })).toEqual({ ok: true, request: { kind: "CODE", expiresInHours: 168, maxUses: 5 } })
    expect(parseCodeInviteForm({ expiry: "30d", maxUses: "1" })).toMatchObject({ request: { expiresInHours: 720 } })
    expect(parseCodeInviteForm({ expiry: "never", maxUses: "" })).toMatchObject({ request: { expiresInHours: null, maxUses: null } })
  })

  it("rejects unknown presets and limits that aren't whole numbers from 1 to 1000", () => {
    expect(parseCodeInviteForm({ expiry: "1y", maxUses: "" })).toEqual({ ok: false, errors: { expiry: "expiry" } })
    for (const maxUses of ["0", "1001", "abc", "2.5", "-1"]) {
      expect(parseCodeInviteForm({ expiry: "7d", maxUses }), maxUses).toEqual({ ok: false, errors: { maxUses: "maxUses" } })
    }
  })
})

describe("parseDirectInviteForm", () => {
  it("takes friends by id and emails typed one per line or separated, lowercased and deduplicated", () => {
    const id = "11111111-1111-4111-8111-111111111111"
    const parsed = parseDirectInviteForm({ expiry: "7d", userIds: [id, id], emails: "Ana@Example.test\nbob@example.test, ana@example.test; carol@example.test" })
    expect(parsed).toEqual({
      ok: true,
      request: { kind: "DIRECT", targets: [{ userId: id }, { email: "ana@example.test" }, { email: "bob@example.test" }, { email: "carol@example.test" }], expiresInDays: 7 },
    })
  })

  it("maps the presets to days and has no 'never'", () => {
    expect(parseDirectInviteForm({ expiry: "24h", userIds: [], emails: "a@b.co" })).toMatchObject({ request: { expiresInDays: 1 } })
    expect(parseDirectInviteForm({ expiry: "30d", userIds: [], emails: "a@b.co" })).toMatchObject({ request: { expiresInDays: 30 } })
    expect(parseDirectInviteForm({ expiry: "never", userIds: [], emails: "a@b.co" })).toEqual({ ok: false, errors: { expiry: "expiry" } })
  })

  it("needs at least one person, at most twenty, and every email valid", () => {
    expect(parseDirectInviteForm({ expiry: "7d", userIds: [], emails: " " })).toEqual({ ok: false, errors: { targets: "targets" } })
    expect(parseDirectInviteForm({ expiry: "7d", userIds: ["not-a-uuid"], emails: "" })).toEqual({ ok: false, errors: { targets: "targets" } })
    expect(parseDirectInviteForm({ expiry: "7d", userIds: [], emails: "ana@example.test\nnope" })).toEqual({ ok: false, errors: { targets: "email" } })
    const many = Array.from({ length: 21 }, (_, i) => `p${i}@example.test`).join("\n")
    expect(parseDirectInviteForm({ expiry: "7d", userIds: [], emails: many })).toEqual({ ok: false, errors: { targets: "targets" } })
  })
})

describe("splitEmails", () => {
  it("splits on newlines, commas, semicolons and spaces", () => {
    expect(splitEmails("a@b.co, c@d.co;e@f.co\n g@h.co")).toEqual(["a@b.co", "c@d.co", "e@f.co", "g@h.co"])
  })
})

describe("inviteErrorKey and labels", () => {
  it("maps the API's codes and falls back to generic", () => {
    expect(inviteErrorKey("CIRCLE_NOT_OPEN")).toBe("notOpen")
    expect(inviteErrorKey("NOT_APPROVER")).toBe("notManager")
    expect(inviteErrorKey("ALREADY_MEMBER")).toBe("alreadyMember")
    expect(inviteErrorKey("INVITE_PENDING")).toBe("alreadyInvited")
    expect(inviteErrorKey("PROFILE_NOT_FOUND")).toBe("userNotFound")
    expect(inviteErrorKey("INVITE_NOT_ACTIVE")).toBe("notActive")
    expect(inviteErrorKey("BACKEND_UNAVAILABLE")).toBe("unavailable")
    expect(inviteErrorKey("NOT_FOUND")).toBe("featureUnavailable")
    expect(inviteErrorKey("SOMETHING_ELSE")).toBe("generic")
  })

  it("labels an invitee by name, else by the typed email", () => {
    expect(inviteeLabel({ displayName: "Ana G.", email: "ana@example.test" })).toBe("Ana G.")
    expect(inviteeLabel({ displayName: null, email: "ana@example.test" })).toBe("ana@example.test")
  })
})
