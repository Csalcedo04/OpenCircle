import { describe, expect, it } from "vitest"
import { parseProfileForm, profileErrorKey, type ProfileFormFields } from "./profile-form"

const valid: ProfileFormFields = {
  fullName: "Ana Gómez",
  phone: "+573001234567",
  dob: "1995-04-12",
  nationality: "co",
  documentType: "cc",
  documentNumber: "1023456789",
}

describe("parseProfileForm: create", () => {
  it("accepts a complete profile and normalizes nationality and passport numbers", () => {
    expect(parseProfileForm(valid, "create")).toEqual({
      ok: true,
      mode: "create",
      profile: { ...valid, nationality: "CO" },
    })
    const passport = parseProfileForm({ ...valid, documentType: "pp", documentNumber: "ab12345" }, "create")
    expect(passport).toMatchObject({ ok: true, profile: { documentType: "pp", documentNumber: "AB12345" } })
  })

  it("flags each invalid field with its own message key", () => {
    const result = parseProfileForm(
      { fullName: "", phone: "3001234567", dob: "12/04/1995", nationality: "COL", documentType: "cc", documentNumber: "12ab" },
      "create",
    )
    expect(result).toEqual({
      ok: false,
      errors: { fullName: "fullName", phone: "phone", dob: "dob", nationality: "nationality", documentNumber: "documentNumber" },
    })
  })

  it("applies the document rules per type", () => {
    const number = (documentType: string, documentNumber: string) =>
      parseProfileForm({ ...valid, documentType, documentNumber }, "create").ok
    expect(number("cc", "123")).toBe(true)
    expect(number("cc", "12")).toBe(false)
    expect(number("ti", "1234567890123456")).toBe(false)
    expect(number("pp", "1234")).toBe(false)
    expect(number("pp", "A1B2C3")).toBe(true)
    expect(parseProfileForm({ ...valid, documentType: "dni" }, "create")).toMatchObject({
      ok: false,
      errors: { documentType: "documentType" },
    })
  })

  it("rejects a birth date in the future", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(parseProfileForm({ ...valid, dob: tomorrow }, "create")).toMatchObject({ ok: false, errors: { dob: "dob" } })
  })
})

describe("parseProfileForm: update", () => {
  it("only sends the editable fields; the document is ignored even if invalid", () => {
    const result = parseProfileForm({ ...valid, documentType: "", documentNumber: "" }, "update")
    expect(result).toEqual({
      ok: true,
      mode: "update",
      patch: { fullName: "Ana Gómez", phone: "+573001234567", dob: "1995-04-12", nationality: "CO" },
    })
  })
})

describe("profileErrorKey", () => {
  it("maps known API conflicts and falls back to a generic message", () => {
    expect(profileErrorKey("DOCUMENT_IN_USE")).toBe("documentInUse")
    expect(profileErrorKey("EMAIL_IN_USE")).toBe("emailInUse")
    expect(profileErrorKey("EMAIL_REQUIRED")).toBe("emailRequired")
    expect(profileErrorKey("SOMETHING_NEW")).toBe("generic")
  })
})
