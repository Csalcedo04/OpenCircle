# Tasks

## 1. Schema and migration

- [x] 1.1 Add to `backend/src/db/schema.ts`:
  - `CIRCLE_CADENCES` and `circles.cadence`
  - `rounds.starts_at`
  - the contribution columns (`incoming_payment_url`, `quote_url`, `outgoing_payment_url`, `requested_at`, `failure_code`)
  - the `test_clocks` table and `circles.test_clock_id`

  Verify: `npm run db:generate` produces `0006_circle_periods.sql` with only CREATE and ALTER … ADD statements, and `tsc --noEmit` passes.
- [x] 1.2 Hand-edit the migration to backfill `cadence` from `round_length_days` and `starts_at` from `deadline`. Verify: no DROP in the file, reviewed in the diff.
- [ ] 1.3 Check the applied migration hashes on the shared Supabase DB, then apply with `npm run db:migrate` (ask the user before running it). Verify: `drizzle.__drizzle_migrations` lists 0006.

## 2. Period schedule

- [x] 2.1 Add `backend/src/services/circles/period-schedule.ts` with `periodStart` and `periodEnd` (WEEKLY = 7 days, MONTHLY = calendar months from the start, clamped). Verify: unit tests cover weekly, a Jan 31 start, a leap year, and period 50.
- [ ] 2.2 Switch the create schema and service from `roundLengthDays` to `cadence`. `start(tx, circle, now)` writes `starts_at` and `deadline` from the schedule. Verify: `circles.integration.test.ts` checks the boundaries of a monthly circle with 3 members, and 400 when `roundLengthDays` is sent.

## 3. Open Payments payments module

- [x] 3.1 Add the server-only `services/open-payments/payments.ts` with:
  - a cached pool incoming-payment grant
  - `createIncomingPayment` / `readIncomingPayment` on the pool wallet
  - `payFromMember` (rotates the token, then creates the quote and the outgoing payment with `metadata.contributionKey`)
  - `findMemberPayment` (lists outgoing payments by metadata key)

  Verify: unit tests with a fake `AuthenticatedClient` check the argument shapes against SDK 7.4.0 types, plus `tsc`.
- [ ] 3.2 Persist rotated member tokens (encrypted) and the new manage URI in `wallet_grants`. Verify: a unit test where an expired token is rotated once and saved, never logged.
- [x] 3.3 Add `fakePayments()` to `backend/test/helpers/fakes.ts`, with switches for settle-later, refuse and lose-response. Verify: used by the tests in section 4.

## 4. Period engine

- [ ] 4.1 Add `services/circles/period-engine.ts` `advanceCircle(circleId, now)` with the sync → close → open → request steps (design decision 4), locking the circle row. Verify: integration test of open, request, settle, FUNDED, and a second run that changes nothing.
- [ ] 4.2 Payment flow with prepare and recover (design decision 5). Verify:
  - a lose-response fake leads to one outgoing payment total after a rerun
  - no grant gives FAILED `NO_GRANT`
  - a refused quote gives FAILED `QUOTE_FAILED`
- [ ] 4.3 Deadline handling: a final sync, then the unpaid contributions become FAILED `DEADLINE_MISSED` and the round BLOCKED, and the next round still opens. Verify with an integration test.
- [ ] 4.4 Audit events for every round and contribution status change, with no PII or tokens. Verify: the test asserts the `audit_events` rows and their fields.

## 5. Test clocks API

- [x] 5.1 Add `TEST_CLOCKS_ENABLED` to `config/env.ts` and `.env.example`, and mount `routes/test-clocks.ts` only when it is on. Verify: with the flag off, `POST /api/test-clocks` answers 404.
- [ ] 5.2 Add `services/test-clock.service.ts` and its routes: create, get (with the per-circle period view), advance (`to` ≥ frozen, otherwise 422; walks the boundaries in order; 15 s settle polling). Verify: an integration test drives a 3-member monthly circle through all 3 periods on one clock with fake payments, and another user gets 404.
- [ ] 5.3 Accept `testClockId` on circle create (owner only, flag on), and use the clock's time in `join` → `start`. Verify: an integration test shows `startedAt` equals the clock's frozen time.

## 6. Frontend

- [x] 6.1 Add the circle and test clock DTOs and calls to `frontend/src/lib/api/backend.ts` (zod-parsed): createTestClock, getTestClock, advanceTestClock, createCircle, getCircleFromApi, joinCircle. Verify: unit tests parse sample responses.
- [x] 6.2 Add `/[lang]/dev/test-clocks` (create form) and `/[lang]/dev/test-clocks/[id]` (simulated date; per circle: period, beneficiary, member statuses and join link; create-circle form with weekly or monthly; Advance one period and Refresh), gated by `TEST_CLOCKS_ENABLED`, with error.tsx and loading.tsx, in en and es per the brand skill. Verify: `tsc`, lint, and not-found when the flag is off.
- [x] 6.3 Add `/[lang]/dev/circles/[id]` with seats and a join form for the free payout rounds. Verify: `tsc` and lint.
- [x] 6.4 Add the flow helpers (next boundary across circles, free payout rounds) with unit tests. Verify: vitest.

## 7. End-to-end on testnet

- [ ] 7.1 Write `backend/docs/test-clock.md`: N test users, a Deposit of play money on `wallet.interledger-test.dev`, consent, creating a clock and circle, advancing. Verify: reviewed with the user.
- [ ] 7.2 Run it manually with 2 or 3 members: advance through every period, and check the pool wallet balance went up by contribution × members × periods. Verify: report the real outputs, including whether the test wallet accepted the grant with no limits.
- [ ] 7.3 Run `tsc --noEmit`, the backend and frontend tests, and lint, then `graphify update .`. Verify: all green, and the outputs are reported.
