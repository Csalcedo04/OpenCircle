# Test clocks: running a circle's periods on the testnet

A test clock gives circles a simulated time that you move forward by hand, like Stripe test clocks. Advancing the clock runs the same period engine real time would:
- it opens each period
- it asks every member's wallet for their contribution
- it confirms the money arrived at the pool
- it closes the period as **Funded** or **Blocked**

Dev only. Testnet funds only (`interledger-test.dev`).

## 1. Turn it on

| Where | Variable | Value |
| --- | --- | --- |
| `backend/.env` | `TEST_CLOCKS_ENABLED` | `true` |
| `frontend/.env.local` | `TEST_CLOCKS_ENABLED` | `true` |

With either one unset, the API answers 404 on `/api/test-clocks` and the dev pages show not-found. Never set it in production.

The pool is OpenCircle's own wallet (`OP_CLIENT_WALLET_ADDRESS`). Contributions arrive there.

## 2. Prepare the members (once per test user)

A circle of N members needs N accounts, so use separate browsers or profiles. For each one:

1. **Test wallet with play money:** on https://wallet.interledger-test.dev, sign up, create an account in the same asset as the pool wallet, then click **Deposit** and add play money. Each member needs at least `contribution × N`.
2. **OpenCircle account:** sign in, finish onboarding, and pass the Didit KYC check.
3. **Wallet permission:** during onboarding, connect the test wallet and approve the permission it asks for. That grant is what lets the pool charge each period.

## 3. Run a circle

1. As the organizer, open `/es/dev/test-clocks` (or `/en/…`) and create a clock. The start date is the circle's day 0, in UTC.
2. On the clock page, create a circle: amount in minor units (500 = 5.00), size N, **Weekly** or **Monthly**, and your payout period.
3. Send each member the circle's **join link** (`/{lang}/dev/circles/{id}`). Each one picks a free payout period.
4. When the last seat is taken, the circle starts at the clock's time. Period 1 opens and every member is asked for their amount right away.
5. Back on the clock page:
   - **Advance one period** moves the clock to the next period start or deadline. Before closing a period at its deadline, it waits up to 15 seconds for payments still in flight.
   - **Refresh payments** re-reads the pool's incoming payments without moving the clock. Use it if a payment was still "Sent, waiting".
6. Repeat until there is nothing left to advance. With N members there are N periods, each one paid out to the member whose payout period it is (the payout itself is a later change).

## 4. What to check

- Every period ends **Funded**, and every member shows **Received**.
- The pool wallet's balance went up by `contribution × N × N`, which you can see in the test wallet UI.
- If a member shows **Failed**:

| Reason | Cause |
| --- | --- |
| no wallet permission | the member has no active grant. Redo the wallet step in onboarding |
| wallet refused the quote | usually not enough balance, or an asset mismatch |
| wallet refused the payment | the grant doesn't allow it. Report it: the grant has no limits by design, and this is the open question for the testnet |
| not received by the deadline | the payment didn't arrive before the clock passed the deadline |

## 5. API (for scripts)

All requests need `Authorization: Bearer <Supabase access token>`, and only the clock's owner can read or move it.

```
POST /api/test-clocks                 { "name": "demo", "frozenTime": "2026-01-31T12:00:00Z" }
GET  /api/test-clocks/{id}
POST /api/test-clocks/{id}/advance    { "to": "2026-02-28T12:00:00Z" }   # "to" = frozenTime → refresh only
POST /api/circles                     { ..., "cadence": "MONTHLY", "testClockId": "{id}" }
```

**How it works:** `src/services/circles/period-engine.ts` (engine), `src/services/open-payments/payments.ts` (Open Payments calls), and `openspec/changes/circle-test-clock/` (spec and design).
