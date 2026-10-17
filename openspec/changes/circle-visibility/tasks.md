# Tasks

## 1. Schema and migration

- [ ] 1.1 Add `CIRCLE_VISIBILITIES`, `circles.visibility` (default PRIVATE) and a unique `circles.invite_code`. In the generated migration, backfill existing rows to PUBLIC with random invite codes. Verify: the migration file has no DROP, and `tsc` passes.
- [ ] 1.2 Check the shared DB's migration hashes, then apply (ask the user first). Verify: every existing circle has `visibility = 'PUBLIC'`.

## 2. Backend

- [ ] 2.1 Add an `optionalUser` middleware factored out of `requireUser`. Verify: unit tests for no token, a valid token, and an invalid token (401).
- [ ] 2.2 Add the `canSee` access check in `circle.service.ts`. `list` returns only PUBLIC; `get` and `join` take a userId and an invite, and a miss throws CIRCLE_NOT_FOUND. Verify: integration tests for a stranger (404), the invite (200 and join), a member without the invite (200), and the public list excluding private circles.
- [ ] 2.3 Add `visibility` on the create schema, with `inviteUrl` in the DTO for the creator only. Verify: an integration test where the default is PRIVATE and a non-creator gets no `inviteUrl`.
- [ ] 2.4 Add `PATCH /:id/visibility` and `POST /:id/invite-code` (creator only, OPEN only). Verify: tests where the old code gives 404 after a rotation and a non-OPEN circle gives 409.
- [ ] 2.5 Update `fakeServices` and `backend/.env.example` docs if needed. Verify: the backend test suite is green.

## 3. Frontend

- [ ] 3.1 Add a private/public choice to the create form (default private, en and es). Verify: the e2e create flow.
- [ ] 3.2 Pass `?invite=` from the URL through the circle and join pages to the API, and add a share-invite-link box for the creator (copy, rotate). Verify: an e2e test where an invited second user joins and a stranger sees not-found.
- [ ] 3.3 Run `tsc --noEmit`, the tests and lint, then `graphify update .`. Verify: all green, and the outputs are reported.
