# Design

## Context

- `GET /api/circles` and `GET /api/circles/:id` are public and return every circle.
- `POST /:id/join` needs a verified user but has no other access check.
- `listForUser` already returns the user's own circles.
- The frontend circle pages still read mock data.

## Goals / Non-Goals

**Goals:**
- Private by default.
- Invite-link access.
- No way to tell a private circle from a missing one.

**Non-Goals:**
- Per-user invitations, by email or phone.
- Approving join requests.
- Hiding the circles a user belongs to from their own list.

## Decisions

1. **Invite codes:**
   - **The code:** `circles.invite_code` is 32 bytes from `crypto.randomBytes`, base64url, with a unique index. It is set for every circle, so turning a circle private later needs no extra step.
   - **How it is checked:** it travels as the query param `?invite=` on GET and in the join body as `invite`. The service compares it in constant time after looking the circle up by id.
   - **Alternative rejected:** signed invite JWTs. Revoking one would need a deny-list, while rotating a stored code revokes in one write.
2. **Access check in the service**, not the route. `get(circleId, { userId?, invite? })` and `join(…, invite?)` share one `canSee(circle, userId, invite)` helper: PUBLIC, or a member, or a matching invite. On a miss it throws `CIRCLE_NOT_FOUND`, so GET answers 404 rather than 403.
3. **The code is in the DTO only for the creator:** `inviteUrl` is built from `FRONTEND_URL` + `/{locale}/circles/{id}?invite=…`, and only when the viewer is the creator.
4. **`GET /api/circles/:id` becomes "optional auth":** it reads the user if a bearer token is present and stays public otherwise. This uses the existing `requireUser` logic factored into an `optionalUser` middleware.
5. **Migration:** add the column with default `'PRIVATE'`, then `update circles set visibility = 'PUBLIC'` for existing rows in the same migration, then backfill `invite_code` for existing rows.

## Risks / Trade-offs

- **[The invite link leaks]** → The creator can rotate the code. Joining still needs a KYC-approved account.
- **[Codes in server logs through the query string]** → The backend doesn't log request URLs today. Keep it that way, and don't add the code to audit events.
- **[Test-clock change touches the same `create` code]** → Whichever change lands second rebases. The fields are independent.
