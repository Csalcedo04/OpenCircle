import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addressedTo, inviteUrl, newInviteToken, shownStatus } from "../src/services/circles/invite-access";

const now = new Date("2026-10-17T12:00:00Z");
const later = new Date("2026-10-18T12:00:00Z");
const earlier = new Date("2026-10-16T12:00:00Z");

describe("shownStatus", () => {
  test("stored states other than ACTIVE show as they are", () => {
    assert.equal(shownStatus({ status: "ACCEPTED", expiresAt: earlier, maxUses: 1, uses: 1 }, now), "ACCEPTED");
    assert.equal(shownStatus({ status: "REVOKED", expiresAt: null, maxUses: null, uses: 0 }, now), "REVOKED");
  });

  test("an active invite is EXPIRED once past its date or out of uses", () => {
    assert.equal(shownStatus({ status: "ACTIVE", expiresAt: null, maxUses: null, uses: 100 }, now), "ACTIVE");
    assert.equal(shownStatus({ status: "ACTIVE", expiresAt: later, maxUses: 3, uses: 2 }, now), "ACTIVE");
    assert.equal(shownStatus({ status: "ACTIVE", expiresAt: earlier, maxUses: null, uses: 0 }, now), "EXPIRED");
    assert.equal(shownStatus({ status: "ACTIVE", expiresAt: now, maxUses: null, uses: 0 }, now), "EXPIRED");
    assert.equal(shownStatus({ status: "ACTIVE", expiresAt: later, maxUses: 3, uses: 3 }, now), "EXPIRED");
  });
});

describe("addressedTo", () => {
  const ana = { id: "user-ana", email: "ana@example.test" };

  test("a code admits anyone", () => {
    assert.equal(addressedTo({ kind: "CODE", userId: null, email: null }, ana), true);
  });

  test("a direct invite admits its user, or whoever holds the email (any case)", () => {
    assert.equal(addressedTo({ kind: "DIRECT", userId: "user-ana", email: null }, ana), true);
    assert.equal(addressedTo({ kind: "DIRECT", userId: "user-bob", email: null }, ana), false);
    assert.equal(addressedTo({ kind: "DIRECT", userId: null, email: "ana@example.test" }, ana), true);
    assert.equal(addressedTo({ kind: "DIRECT", userId: null, email: "ana@example.test" }, { ...ana, email: "Ana@Example.test" }), true);
    assert.equal(addressedTo({ kind: "DIRECT", userId: null, email: "bob@example.test" }, ana), false);
  });

  test("once the email's owner is known, only that user is admitted", () => {
    const invite = { kind: "DIRECT" as const, userId: "user-bob", email: "ana@example.test" };
    assert.equal(addressedTo(invite, ana), false);
    assert.equal(addressedTo(invite, { id: "user-bob", email: "other@example.test" }), true);
  });
});

describe("invite links", () => {
  test("carry the token on the default locale's circle page", () => {
    const url = new URL(inviteUrl("http://localhost:3001", "c-1", "tok_en"));
    assert.equal(url.origin, "http://localhost:3001");
    assert.equal(url.pathname, "/es/circles/c-1");
    assert.equal(url.searchParams.get("invite"), "tok_en");
  });

  test("tokens are long, URL-safe and never repeat", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    assert.match(a, /^[\w-]{40,}$/);
    assert.notEqual(a, b);
  });
});
