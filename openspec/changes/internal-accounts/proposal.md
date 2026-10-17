# Proposal

## Why

Today every user must bring their own wallet from the Interledger test wallet (sign up at
`wallet.interledger-test.dev`, verify an email, pass GateHub's KYC) and link it to OpenCircle with
an interactive GNAP grant before they can join a circle. That is the biggest drop-off in onboarding.

Open Payments has no operation to create a wallet or a wallet address; only the wallet's provider
(an ASE such as Rafiki, through its Admin API) can. OpenCircle is a client of the test wallet, not an
ASE, and the team ruled out running its own Rafiki. So OpenCircle cannot hand out wallet addresses.
What it can do is keep **internal accounts** on a ledger backed by the single wallet it already owns
(`OP_CLIENT_WALLET_ADDRESS`, today both its client identity and every circle's pool).

## What Changes

- **Internal accounts.** A user can create one OpenCircle account during onboarding, in one click,
  with no external signup. It is a ledger balance in OpenCircle's wallet asset, identified by an
  opaque id. It is **not** an Open Payments wallet address and never pretends to be one.
- **External wallets stay.** Linking an Interledger test wallet (the current GNAP flow) remains an
  option the user can take at onboarding or later from the account page, for deposits and for paying
  contributions from their own wallet.
- **Ledger.** Balanced two-leg transfers (`ledger_transfers`) between `ledger_accounts` of kind
  `USER`, `CIRCLE_POOL` and `SYSTEM`; integer minor units, idempotent by key, row-locked, audited.
  Σ balances per asset is always 0: the `SYSTEM` accounts `DEMO_SEED` and `OP_WALLET` are the
  counterparts of seeded demo money and of money that really reached OpenCircle's wallet.
- **Demo seed.** A new account is credited `DEMO_SEED_VALUE` test funds (dev/demo only), shown as a
  `SEED` movement.
- **Contributions.** Each seat has a funding source, `INTERNAL_ACCOUNT` or `EXTERNAL_WALLET`. An
  internal contribution is a ledger transfer user → circle pool, completed in the same transaction
  (the transfer is the proof). Without enough balance it stays `PENDING` and is retried every run
  until the deadline, then `DEADLINE_MISSED` as today. External contributions keep the Open Payments
  path; when one completes, the ledger posts `OP_WALLET → CIRCLE_POOL` so pool balances are true for
  both sources.
- **Deposits.** From any test-network wallet: OpenCircle creates a real incoming payment on its
  wallet, one per deposit, and credits the account once it reads the payment as received. A user with
  a linked wallet can pay it with one click through their existing grant.
- **Copy.** The landing, FAQ and legal pages stop claiming "non-custodial" and describe the hybrid,
  custodial-for-demo model plainly.
- **Out of scope:** withdrawals and payouts to external wallets (they need an interactive
  `outgoing-payment` grant by the operator on OpenCircle's own wallet, which does not exist yet),
  unlinking an external wallet, KYC for deposits.

## Capabilities

### New Capabilities
- `internal-accounts`: ledger accounts and transfers, account creation with demo seed, deposits by
  incoming payment, and funding contributions from an internal account.

### Modified Capabilities
- `circle-visibility` / circles: a seat's funding source; the pool as a ledger account.

## Impact

- **DB (additive migration on the shared database):** `ledger_accounts`, `ledger_transfers`,
  `account_deposits`; `audit_events.wallet_id` becomes nullable with a new `account_id`;
  `circle_members.funding_source` (default `EXTERNAL_WALLET`); one `CIRCLE_POOL` account backfilled
  per existing circle. No drops.
- **Backend:** `services/ledger/*`, `services/money.ts`, `routes/internal-accounts.ts`,
  `period-engine.ts` (internal path), `circle.service.ts` (pool account, seat funding),
  `kyc.service.ts` (onboarded = wallet or account), `account.service.ts` (dashboard), env
  `DEMO_SEED_VALUE`.
- **Frontend:** onboarding step 2 becomes a choice; `/account` gains the internal balance, deposits
  and the external-wallet card; join form picks the funding source; dictionaries, landing, legal.
- **Branch:** `feat/internal-accounts`, one commit per phase, PR against `main`.
