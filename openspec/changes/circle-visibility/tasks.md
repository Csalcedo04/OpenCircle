# Tasks

## 1. Schema and migration

- [x] 1.1 Add `CIRCLE_VISIBILITIES`, `circles.visibility` (default PRIVATE) and a unique `circles.invite_code`. In the generated migration, backfill existing rows to PUBLIC with random invite codes. Verify: the migration file has no DROP, and `tsc` passes.
- [x] 1.2 Check the shared DB's migration hashes, then apply (ask the user first). Verify: every existing circle has `visibility = 'PUBLIC'`.

## 2. Backend

- [x] 2.1 Add an `optionalUser` middleware factored out of `requireUser`. Verify: unit tests for no token, a valid token, and an invalid token (401).
- [x] 2.2 Add the `canSee` access check in `circle.service.ts`. `list` returns only PUBLIC; `get` and `join` take a userId and an invite, and a miss throws CIRCLE_NOT_FOUND. Verify: integration tests for a stranger (404), the invite (200 and join), a member without the invite (200), and the public list excluding private circles.
- [x] 2.3 Add `visibility` on the create schema, with `inviteUrl` in the DTO for the creator only. Verify: an integration test where the default is PRIVATE and a non-creator gets no `inviteUrl`.
- [x] 2.4 Add `PATCH /:id/visibility` and `POST /:id/invite-code` (creator only, OPEN only). Verify: tests where the old code gives 404 after a rotation and a non-OPEN circle gives 409.
- [x] 2.5 Update `fakeServices` and `backend/.env.example` docs if needed. Verify: the backend test suite is green.
- [x] 2.6 Filter `GET /api/members/:id` so circles the viewer can't see, and reviews from them, are left out (`listForUser(userId, viewerId)`, `visibleIds`). Verify: an integration test where a stranger doesn't see the private circle or its review, and a fellow member does.
- [x] 2.7 Test-clock dev pages: the clock view returns each circle's `inviteCode` (owner only), the join link carries `?invite=`, and the dev circle page passes it to GET and join. Verify: frontend typecheck, lint and tests.

## 3. Frontend

Blocked until the other session's circle-pages PR (feat/circles-real-data) lands: that branch owns the circle pages, the create form and `lib/api/backend.ts`'s circle functions, and will add the `invite` parameter to getCircle/joinCircle.


- [ ] 3.1 Add a private/public choice to the create form (default private, en and es). Verify: the e2e create flow.
- [ ] 3.2 Pass `?invite=` from the URL through the circle and join pages to the API, and add a share-invite-link box for the creator (copy, rotate). Verify: an e2e test where an invited second user joins and a stranger sees not-found.
- [ ] 3.3 Run `tsc --noEmit`, the tests and lint, then `graphify update .`. Verify: all green, and the outputs are reported.
