# Proposal

## Why

Today every circle appears in the public list at `GET /api/circles`, and anyone can open and join it. Most natilleras are between people who know each other, so a circle should be private by default: only people the creator invites can see and join it. A creator can still choose to make it public so strangers can find it.

## What Changes

- New circle visibility, `PRIVATE` or `PUBLIC`. It defaults to `PRIVATE`, and the creator picks it when creating the circle.
- **Private circles:**
  - They do not appear in the public list.
  - Their detail page and join are reachable only by members, or with the circle's invite link (a random code the creator shares).
  - Anyone else gets 404, the same answer as for a circle that doesn't exist.
- **Public circles:** they behave as today. They are listed, open to anyone, and can be joined by any verified user.
- **Changing visibility:** the creator can switch it while the circle is still `OPEN`. The creator can also rotate the invite code, which stops the old link from working.
- "My circles" (`GET /api/users/me/circles`) keeps showing the user's own circles of both kinds.
- **BREAKING:** circles created after the change are private unless the request says `visibility: "PUBLIC"`. Circles that already exist are migrated as `PUBLIC`, so nothing that is visible today disappears.

## Capabilities

### New Capabilities
- `circle-visibility`: private and public circles, invite links, and who can list, view and join.

### Modified Capabilities
<!-- None: no specs exist yet in openspec/specs/. -->

## Impact

- **DB (additive migration on the shared database):** `circles.visibility` defaults to `PRIVATE`, with a backfill of `PUBLIC` for existing rows, plus a unique `circles.invite_code`.
- **Backend:**
  - `circle.service.ts`: list filter, access check on get and join, set visibility, rotate the invite code.
  - `routes/circles.ts`: `visibility` on create, an `invite` query param, `PATCH /:id/visibility`, `POST /:id/invite-code`.
  - The test fakes.
- **Frontend:**
  - A visibility choice in the create form.
  - A share-invite-link box for the creator.
  - The invite code carried through the circle and join pages.
- **Order:** this is independent of `circle-test-clock`, and either can ship first. Both change `circle.service.ts` `create` and the create schema, so the second one rebases.
