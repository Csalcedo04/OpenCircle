# Design

## Context

- OpenCircle owns one Open Payments wallet (`OP_CLIENT_WALLET_ADDRESS`). It is the client identity
  whose key is published, and `circle.service.create` upserts it as every circle's `pool_wallet_id`.
- Members today pay contributions from their own wallet: `period-engine.pay()` creates an incoming
  payment on the pool and `member-access.withAccess` pays it with the member's GNAP grant.
- `wallet_balances` exists but is always 0; nothing is a ledger yet.
- Open Payments cannot create wallet addresses. Only an ASE (Rafiki Admin API) can, and OpenCircle
  is not one.

## Goals / Non-Goals

**Goals:**
- One-click onboarding with an internal account, no external signup.
- Keep the bring-your-own-wallet path intact and optional.
- A ledger whose balances are provably consistent: integers, idempotent, balanced, audited.
- Honest accounting of demo money vs money that really reached OpenCircle's wallet.

**Non-Goals:**
- Fake wallet addresses or a fake auth/resource server for internal accounts.
- Withdrawals or payouts to external wallets (operator outgoing-payment grant does not exist).
- Running Rafiki.

## Decisions

1. **Ledger shape: two-leg rows, not journal entries.** `ledger_transfers` holds `from`, `to`,
   `value`, asset and a unique `idempotency_key`. One row is a debit and a credit at once, so it can
   never be unbalanced. `ledger_accounts.balance` is a cache updated in the same transaction; the
   invariant `balance = Σ(to) − Σ(from)` is testable.
   - *Rejected:* a `ledger_entries` table with one row per leg. Two writes per leg for no extra
     guarantee.
2. **SYSTEM accounts as counterparts.** `DEMO_SEED` funds seeded demo money; `OP_WALLET` mirrors
   money that really arrived on OpenCircle's wallet (deposits, external contributions). Only SYSTEM
   accounts may go negative. Σ balances per asset is always 0, and `−balance(OP_WALLET)` is the part
   of the ledger backed by real test-network funds.
3. **Internal account = `ledger_accounts` row of kind USER**, found through `owner_user_id`.
   `users.op_wallet` keeps meaning "external wallet". A user may have both; each at most once.
4. **Circle pool = `ledger_accounts` row of kind CIRCLE_POOL** per circle, created with the circle
   and backfilled for existing ones. `circles.pool_wallet_id` (the real wallet) is unchanged.
5. **Funding source per seat** (`circle_members.funding_source`). The engine branches on it:
   - `INTERNAL_ACCOUNT`: one transaction does the compare-and-set `PENDING → COMPLETED` and the
     `USER → CIRCLE_POOL` transfer keyed by `contributions.idempotency_key`. The transfer is the
     proof. `InsufficientFundsError` rolls back and the contribution stays `PENDING`; the deadline
     path (`DEADLINE_MISSED`) is unchanged. An audit row `contribution.insufficient_funds` is
     written once.
   - `EXTERNAL_WALLET`: today's path. When `sync()` sees the incoming payment received, the same
     transaction posts `OP_WALLET → CIRCLE_POOL`, so pool balances are true for both sources.
6. **Deposits are incoming payments on OpenCircle's wallet**, one per deposit, created with the
   existing `payments.createIncomingPayment` (pool grant already covers `incoming-payment
   create/read`). The deposit id is generated before the call so the payment metadata carries it.
   Completion proof is OpenCircle reading its own incoming payment as received, the same proof the
   engine uses (Rafiki webhooks are not available to a test-wallet client). A linked external wallet
   can pay the deposit via `member-access.withAccess` + `payments.payFromMember` with the same key.
7. **Seed is explicit and gated.** `DEMO_SEED_VALUE` (minor units, default `"0"`) seeds every new
   account in the creation transaction with key `seed:<accountId>`; visible as a `SEED` movement.
8. **Naming avoids the dashboard.** `account.service.ts`, `/me/dashboard` and the frontend
   `/account` page already exist, so this change uses "internal account": `services/ledger/*`,
   `/users/me/internal-account*`, `INTERNAL_ACCOUNT_*` error codes.
9. **"Onboarded" = internal account or external wallet** everywhere (backend KYC gate, frontend
   landing/kyc-gate/onboarding), computed by one frontend helper `isOnboarded`.
10. **Audit without a wallet.** `audit_events.wallet_id` becomes nullable and gains `account_id`,
    with a check that one of them is set, so internal-only users still leave an audit trail.

## Risks / Trade-offs

- **[Custody]** The demo holds user balances. Legal pages and landing say so plainly; production
  custody belongs to a licensed partner, as the product already stated.
- **[Cached balance drift]** Mitigated by updating balance and inserting the transfer in one
  transaction under row locks, and by a test asserting `balance = Σ transfers`.
- **[Shared test database]** SYSTEM accounts are keyed by asset and shared across parallel suites;
  tests reconcile only their own transfers and never delete SYSTEM rows.
- **[Deposit URL usability]** Whether the test wallet UI accepts an incoming payment URL as the
  receiver is unverified; the linked-wallet button is the fallback path.
- **[`main` moves fast]** Governance and friends landed during planning. The branch merges `main`
  before the PR is marked ready.
