# Proposal

## Why

A circle runs for N periods, where N is its number of members, and those periods are weeks or months long. Today, when a circle fills, the backend writes every round and round 1's PENDING contributions, and then nothing happens. No code opens later periods, asks members for their amount, or checks deadlines. We cannot show or test that the pool works without waiting real weeks. A Stripe-style test clock gives a circle a simulated time that we can move forward, and moving it forward runs the same period logic real time would.

## What Changes

- **Cadence:** a circle's period is `WEEKLY` or `MONTHLY` instead of a free number of days. Monthly periods follow calendar months, so Jan 31 becomes Feb 28/29 and dates do not drift. The number of periods is still the number of members, one payout per member. `roundLengthDays` stays on existing rows; the API takes `cadence` instead. **BREAKING** for `POST /api/circles` callers that send `roundLengthDays`. Only the frontend calls it, and it uses mock data today.
- **Period engine:** a single `advanceCircle(circle, now)` step, run by the real clock or a test clock:
  - It opens each period whose start time has passed and creates that period's contribution rows.
  - It requests each member's assigned amount from the pool.
  - It closes a period when its deadline passes, as FUNDED if every contribution is confirmed and as BLOCKED otherwise.
  - It is idempotent, so running it twice for the same `now` changes nothing.
- **Requesting the amount (real testnet Open Payments):**
  - For each member in each period, the pool creates an incoming payment on the pool wallet.
  - Using the grant the member already gave, the pool then creates a quote and an outgoing payment from the member's wallet.
  - A contribution becomes `COMPLETED` only after the pool reads its own incoming payment back and sees the received amount. Creating the outgoing payment alone is never proof.
- **Test clocks:**
  - A `test_clocks` table holds a frozen time per clock. A circle can be attached to a clock when it is created.
  - Dev-only endpoints create a clock, advance it (by one period, or to a given time), and inspect it.
  - Advancing runs the engine for every attached circle at each period boundary it crosses, in order.
  - Everything is gated by a `TEST_CLOCKS_ENABLED` env flag. With the flag off, the endpoints return 404 and clock-attached circles cannot be created.
- **Dev pages:** the regular circle pages still use demo data, so test clocks get standalone dev pages, shown only with the flag on:
  - create a clock
  - the clock's page: simulated date, create a circle on it, each circle's period, beneficiary and member statuses, "Advance one period" and "Refresh"
  - a circle join page others open from a link
  
  Moving the real circle pages onto the API is a separate change.

## Capabilities

### New Capabilities
- `circle-periods`: period schedule from cadence and size, the engine that opens, collects and closes periods, and the rules for marking a contribution complete.
- `circle-test-clock`: simulated time for circles. Create, attach, advance and inspect, plus the dev-only gating and the dev panel.

### Modified Capabilities
<!-- None: no specs exist yet in openspec/specs/. -->

## Impact

- **DB (additive migration on the shared Supabase database; check the applied hashes first):**
  - New enum `circle_cadence` and column `circles.cadence`.
  - New `test_clocks` table and nullable `circles.test_clock_id`.
  - New contribution columns for Open Payments resource URLs (incoming payment, quote, outgoing payment) and a period start on `rounds`.
- **Backend:**
  - `circle.service.ts` (`start`, `create`).
  - New `period-engine` and `test-clock` services.
  - A new Open Payments payments module (incoming payment, quote, outgoing payment, token rotation) in a server-only module.
  - `routes/circles.ts` (cadence), new `routes/test-clocks.ts`, `config/env.ts` (`TEST_CLOCKS_ENABLED`), and the test fakes.
- **Frontend:** `lib/api/backend.ts` (circles and test clock), new dev pages under `app/[lang]/dev/`, and their server actions.
- **Money:** testnet only (`interledger-test.dev`). Each member needs a funded test wallet and an active grant.
- **Out of scope:**
  - The payout to the beneficiary, collateral and the risk check: a period ends at FUNDED or BLOCKED, and paying out is a follow-up change.
  - A production scheduler (cron) for the real clock.
  - Private or public visibility, which is the `circle-visibility` change.
