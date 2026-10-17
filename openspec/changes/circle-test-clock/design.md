# Design

## Context

- **What starting a circle does today:** `circle.service.ts` `start(tx, circle, now)`:
  - inserts every round, with deadline = `startedAt + n × roundLengthDays`
  - opens round 1
  - creates round 1's PENDING contributions with key `contribution:${roundId}:${memberId}`

  Nothing else reads time. There are no Open Payments calls for quotes or payments, no scheduler, and no clock abstraction.
- **The pool wallet** is OpenCircle's own client wallet (`OP_CLIENT_WALLET_ADDRESS`, on `ilp.interledger-test.dev`).
- **Member authorization:** each member has at most one ACTIVE `wallet_grants` row. It holds an encrypted token plus the manage and continue URIs from an interactive grant for `outgoing-payment` (create, read, list) and `quote` (create, read), with **no limits**.
- **Verified against openpayments.dev and SDK 7.4.0:**
  - **Incoming payment on the pool:** requested with a non-interactive `incoming-payment` grant at the pool's `authServer`.
  - **Quote and outgoing payment:** created on the **member's** `resourceServer` with the member's token.
  - **Tokens:** they expire, about 10 min by default, and are renewed with `token.rotate(manageUri)`, which replaces both the token and the manage URI.
  - **Proof:** an outgoing payment has no `completed` flag (rafiki#3984). The pool's incoming payment `receivedAmount` is the best proof open to a client.
  - **Webhooks:** they are operator-only, so we don't get them on the testnet.
  - **Idempotency:** there is no `Idempotency-Key` in Open Payments.

## Goals / Non-Goals

**Goals:**
- One period engine shared by real time and test clocks.
- Safe retries that never debit a member twice.
- Integration tests that drive a circle through all its periods with fakes.
- A manual testnet run from the dev panel.

**Non-Goals:**
- Payout to the beneficiary, collateral and RISK_CHECK.
- A cron or worker for real-time circles.
- Grant limits or intervals: we keep the existing product decision.
- Moving the circle list page off mock data.

## Decisions

### 1. Time is a value passed in, not read
`advanceCircle(circleId, now)` and `start(tx, circle, now)` take `now`. The caller decides which time to use:
- a test-clock circle uses `test_clocks.frozen_time`
- any other circle uses `new Date()`

DB timestamps that describe circle events (`started_at`, `opened_at`, `closed_at`, `completed_at`) are written from that `now`, never from `defaultNow()`. `created_at` and `updated_at` stay real time, because they are bookkeeping, not domain time.
- *Alternative:* a global injectable `Clock` service. Rejected because time is per circle, not per process.

### 2. Cadence and period maths in one pure module
`period-schedule.ts` exports `periodStart(start, cadence, n)` and `periodEnd(start, cadence, n)`.
- Monthly periods add calendar months from the start each time, in UTC, and clamp to the month's last day.
- Pure functions with table tests, including Jan 31, leap years and 50 periods.

`roundLengthDays` stays in the DB for existing rows, but nothing new uses it. It is set from the cadence (7 or 30) for new rows so the existing CHECK still holds.

### 3. `rounds.starts_at` is stored
Each round gets `starts_at` when the circle starts, so the engine selects by stored values with plain SQL (`starts_at <= now`, `deadline <= now`) rather than recomputing them.

### 4. Engine steps, all idempotent
For one circle at `now`. The backend reaches Postgres through Supabase's transaction-mode pooler, so no lock is held across network calls. Instead, every step is a compare-and-set on the row it changes (`update … where status = 'PENDING' returning`). A concurrent run that loses the claim skips the row. A PROCESSING contribution with no saved outgoing payment is only recovered after a 2-minute lease in real time (`requested_at`), so a run never races one that is between its claim and the payment:

1. **Sync:** for every contribution in PROCESSING, read the pool's incoming payment. If `receivedAmount ≥ value`, set it to COMPLETED.
2. **Close:** a COLLECTING round with all contributions COMPLETED becomes FUNDED. If its `deadline <= now` and it isn't funded, sync once more, then set the remaining contributions to FAILED (`DEADLINE_MISSED`) and the round to BLOCKED.
3. **Open:** each UPCOMING round with `starts_at <= now` becomes COLLECTING, and its contribution rows are inserted with `on conflict (idempotency_key) do nothing`.
4. **Request:** for each PENDING contribution of a COLLECTING round, run the payment flow (decision 5).

A test clock advance walks the boundaries: it collects the sorted distinct `starts_at` and `deadline` values in `(frozen, to]` across the attached circles. It runs the engine at each one in order, then at `to`, and finally sets `frozen_time = to`.

Network calls happen **outside** the DB transaction. Each step commits its state change first, so a crash leaves a state the next run can resume from.

### 5. Payment flow per contribution (no Idempotency-Key in Open Payments)
- **a. Prepare.** In the DB, set the contribution PENDING → PROCESSING with `requested_at`, then commit. A run that finds PROCESSING with no `outgoing_payment_url` goes to the recovery path (e) instead of creating the payment again.
- **b. Incoming payment.** If `incoming_payment_url` is null, create the pool's incoming payment with `incomingAmount` = the contribution amount and `metadata.contributionKey` = the idempotency key, then store the URL. A duplicate incoming payment moves no money, so this step is safe to repeat.
- **c. Member token.** Load the member's ACTIVE grant, decrypt it, and rotate the token if it has expired or the call returns 401. Persist the new token and manage URI.
- **d. Quote, then outgoing payment.** Create the quote on the member's `resourceServer` with `receiver` = the incoming payment URL. Then create the outgoing payment with `quoteId` and `metadata.contributionKey`, and store both URLs.
- **e. Recovery.** List the member's outgoing payments and look for `metadata.contributionKey`. If one matches, store its URL. If none matches and the quote has expired, re-quote and create again.
- **f. Errors.** If the member has no grant, the quote is refused, or the grant was revoked, set FAILED with a reason code (`NO_GRANT`, `QUOTE_FAILED`, `PAYMENT_REFUSED`). Network timeouts leave the contribution PROCESSING for the next run.

This is a new server-only module, `services/open-payments/payments.ts`. It sits behind a narrow interface (`createIncomingPayment`, `readIncomingPayment`, `payFromMember`, `findMemberPayment`), so tests swap in a fake.

### 6. Pool access token
The pool's `incoming-payment` grant (create, read) is non-interactive and cached in memory with its expiry, then re-requested when it expires. It is never stored in the DB.

### 7. Test clock data and API
- **Table:** `test_clocks` (`id`, `name`, `owner_user_id`, `frozen_time`, timestamps), plus `circles.test_clock_id` (nullable FK, set only on create).
- **Routes:** `routes/test-clocks.ts`, with schema, types and handlers in one file per backend conventions. It is mounted only when `TEST_CLOCKS_ENABLED`. Otherwise the router isn't mounted, so requests get the app's 404.
- **Advance serialization:** advances of the same clock are chained in process (one API instance; dev only). The engine's compare-and-set steps keep a second process from double-charging even without that.

### 8. Settling during an advance
Testnet payments settle in seconds, not instantly. Before an advance closes a round at its deadline, it polls the sync step every 1 s for up to 15 s while contributions are still PROCESSING. "Advance one period" can therefore close the round with the payments that just went out. The dev panel also has "Refresh", which is an advance to the current time.

### 9. Frontend: dev pages, not the circle pages
The circle pages and the create form run on demo data (`lib/data.ts` → `lib/mock`), with fields the API doesn't have (trust, reviews, coverage). So the clock gets its own pages under `app/[lang]/dev/`, gated by the frontend's `TEST_CLOCKS_ENABLED` (server-side, never `NEXT_PUBLIC_`):
- `/dev/test-clocks` (create)
- `/dev/test-clocks/[id]` (view, advance, refresh, create a circle on it)
- `/dev/circles/[id]` (join)

They are server components that read through `lib/api/backend.ts` (zod-parsed). Mutations are server actions that call the API with the user's session and then `revalidatePath`. Buttons are small `"use client"` leaves using `useActionState`. The next boundary comes from the API's `nextBoundary`, the earliest across the clock's circles. Moving the real circle pages onto the API is out of scope.

## Risks / Trade-offs

- **[The test wallet may refuse a grant with no limits, or cap it]** → The existing consent flow already asks for exactly this grant. The first manual testnet run (task 7.x) is the check. If it fails, the follow-up adds `limits.debitAmount` and `interval` per circle.
- **[Double debit if a run dies between creating the outgoing payment and saving its URL]** → Prepare-then-recover, with the metadata key looked up through `outgoingPayment.list` (decision 5e). It is not a protocol guarantee, so it is documented and tested with a fake that "loses" the response.
- **[Advance takes long]** → Up to 15 s per deadline crossed, plus the payment calls. The panel advances one period at a time. Advancing many periods with `to` is allowed but slow, and the 15 s polling is disabled after the first boundary that has no PROCESSING contributions.
- **[Shared Supabase DB]** → The migration only adds things: an enum, columns and a table. Check the applied migration hashes on the shared DB before migrating.
- **[Each member needs a funded testnet wallet and a grant]** → The manual test guide (task 7.x) covers Deposit on `wallet.interledger-test.dev` and the consent flow, for N test users.
- **[`receivedAmount ≥ value` isn't documented as authoritative]** → It is the only client-visible proof without webhooks. It is read from the pool's own resource server with the pool's own grant, never from the browser or the member side.

## Migration Plan

1. Run `0006_circle_periods` (additive):
   - the `circle_cadence` enum and `circles.cadence`, backfilled from `round_length_days`: 7 becomes WEEKLY, anything else MONTHLY
   - `rounds.starts_at`, backfilled as `deadline − 1 cadence unit`
   - the contribution columns `incoming_payment_url`, `quote_url`, `outgoing_payment_url`, `requested_at`, `failure_code`
   - the `test_clocks` table and `circles.test_clock_id`
2. Deploy the backend with `TEST_CLOCKS_ENABLED` unset in production and set locally or in staging.
3. Rollback: turn the flag off. The columns stay, unused. No drops (no destructive migrations).
