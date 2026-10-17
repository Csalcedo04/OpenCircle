# OpenCircle internal accounts and the ledger

## Why they exist

Open Payments has no operation to create a wallet or a wallet address. Only the wallet's provider (an
account servicing entity such as Rafiki, through its Admin API) can, and OpenCircle is a client of the
Interledger test wallet, not a provider. So OpenCircle cannot hand out wallet addresses; what it can
do is keep **internal accounts** on a ledger backed by the single wallet it owns
(`OP_CLIENT_WALLET_ADDRESS`). An internal account is a balance, identified by an opaque id. It never
pretends to be a wallet address.

The model is hybrid and, for the demo, custodial: a user may have an internal account, a linked
external wallet (the GNAP consent flow), or both. Either one completes onboarding.

## Tables

| Table | Role |
|---|---|
| `ledger_accounts` | `USER` (one per user), `CIRCLE_POOL` (one per circle) and `SYSTEM` (`DEMO_SEED`, `OP_WALLET`; one per code and asset). `balance` is a cache kept in the same transaction as every transfer. |
| `ledger_transfers` | One balanced movement: `from`, `to`, `value`, asset, unique `idempotency_key`. |
| `account_deposits` | A deposit request: the incoming payment URL on OpenCircle's wallet, `PENDING | COMPLETED | FAILED`. |
| `circle_members.funding_source` | `INTERNAL_ACCOUNT` or `EXTERNAL_WALLET` per seat. |
| `audit_events.account_id` | Audit rows may belong to an account instead of (or besides) a wallet. |

## Money model

- Amounts are `bigint` in the asset's minor unit, with `assetCode` and `assetScale`, and travel as
  decimal strings (`services/money.ts`).
- Every transfer has two legs in one row, so the ledger is balanced by construction. `SYSTEM`
  accounts are the counterparts of money entering the ledger and are the only ones allowed to go
  negative, so Σ balances per asset is always 0:
  - `−balance(DEMO_SEED)` is unbacked demo money (`DEMO_SEED_VALUE` seeded at account creation).
  - `−balance(OP_WALLET)` is money that really reached OpenCircle's wallet (deposits and completed
    wallet contributions).
- `transferInTx` locks both accounts (ordered by id), checks the asset and the balance, inserts the
  transfer with `ON CONFLICT DO NOTHING` on the key, updates the cached balances and writes two
  `audit_events` (`ledger.debit`, `ledger.credit`). A repeat with the same key returns the stored
  transfer and moves nothing; the same key with other legs or value is an error.

## Flows

- **Account creation** (`POST /api/users/me/internal-account`): one per user, in OpenCircle's wallet
  asset; seeded from `DEMO_SEED` when `DEMO_SEED_VALUE > 0`.
- **Contributions** (`services/circles/period-engine.ts`): an `INTERNAL_ACCOUNT` seat is settled by a
  transfer `USER → CIRCLE_POOL` keyed by the contribution's idempotency key, in the same transaction
  as the `PROCESSING → COMPLETED` compare-and-set (the transfer is the proof). Without balance the
  contribution goes back to `PENDING`, is retried on every run and misses the deadline like any
  other (`DEADLINE_MISSED`); `contribution.insufficient_funds` is audited once. An `EXTERNAL_WALLET`
  contribution keeps the Open Payments path; when the pool's incoming payment is read as received,
  the same transaction posts `OP_WALLET → CIRCLE_POOL`, so pot balances are true for both sources.
- **Deposits** (`services/ledger/deposit.service.ts`): `POST .../deposits` creates a real incoming
  payment on OpenCircle's wallet for exactly `value`, keyed `deposit:<id>`, open for 30 minutes.
  `GET .../deposits/:id` reads the payment while `PENDING`; received → `COMPLETED` plus
  `OP_WALLET → USER` in one transaction; expired → `FAILED/EXPIRED`. `POST .../deposits/:id/pay` pays
  it from the user's linked wallet through their standing grant.

## Invariants the tests check

`backend/test/ledger.integration.test.ts`, `internal-accounts.integration.test.ts`,
`test-clock.integration.test.ts` and `circles.integration.test.ts` (all need `DATABASE_URL`):

1. Exact amounts; `balance = Σ(to) − Σ(from)`.
2. Idempotent repeat; conflicting repeat rejected.
3. `USER` and `CIRCLE_POOL` never below zero, even under 20 concurrent transfers.
4. Same asset on both accounts and the amount.
5. Internal contributions make no Open Payments calls; wallet contributions are mirrored into the pot.
6. A deposit credits exactly once, and never after it expired.

## Out of scope for now

- Withdrawals and payouts to external wallets: they need an interactive `outgoing-payment` grant by
  the operator on OpenCircle's own wallet, which does not exist yet.
- Unlinking an external wallet.
- Dropping `wallet_balances` (unused): destructive, proposed separately.
