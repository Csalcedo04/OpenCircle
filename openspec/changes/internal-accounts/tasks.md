# Tasks

Branch `feat/internal-accounts`, one commit per section, PR against `main` (draft after section 1).

## 1. Schema and ledger

- [ ] 1.1 Add `ledger_accounts`, `ledger_transfers`, `account_deposits`; make `audit_events.wallet_id` nullable and add `account_id`; add `circle_members.funding_source` (default `EXTERNAL_WALLET`). Migration `0012` idempotent, no DROP, with a `CIRCLE_POOL` backfill per existing circle. Verify: `tsc` passes, the migration has no DROP.
- [ ] 1.2 `services/money.ts` (`Money`, `AmountDto`, `toAmountDto`, `sameAsset`, `minorUnitsSchema`) and `services/ledger/ledger.service.ts` (`systemAccountInTx`, `transferInTx`, `movementsOf`). Verify: `test/ledger.integration.test.ts` covers exact amounts, idempotent repeat, conflicting repeat, insufficient funds, asset mismatch, SYSTEM negative / USER not, 20 concurrent transfers with funds for 10, balance = Σ transfers.
- [ ] 1.3 `circle.service.create` inserts the pool account in the same transaction. Verify: circles integration test sees a pool account with the circle's asset.
- [ ] 1.4 Frontend: `profileSchema.internalAccount` tolerant; `lib/flows/onboarding.ts` with `isOnboarded`; replace `walletAddress` onboarded checks in `lib/auth/landing.ts`, `components/kyc-gate.tsx`, `(app)/onboarding/page.tsx`. Verify: unit tests for the helper; typecheck, lint, tests green; behaviour unchanged while `internalAccount` is null.
- [ ] 1.5 Push and `gh pr create --base main --draft`.

## 2. Account creation, seed, API, onboarding, copy

- [ ] 2.1 `services/ledger/internal-account.service.ts` (`create` with seed, `get`, `movements`, `userAccountInTx`, `poolAccountInTx`), `routes/internal-accounts.ts` (`POST`, `GET`, `GET /movements`), env `DEMO_SEED_VALUE`. Verify: `test/internal-accounts.integration.test.ts` — create (seeded / unseeded), 409 on repeat, 404 without profile, stranger gets 404.
- [ ] 2.2 `user.service.ts` `ProfileDto.internalAccount`; `getPublicProfile` left join; `kyc.service.ts` onboarded = wallet or account, audit by `accountId`; `account.service.ts` dashboard gains `internalAccount` and `LEDGER` activity. Verify: KYC start succeeds for an internal-only user; dashboard test.
- [ ] 2.3 Frontend onboarding choice (`funding-choice.tsx`, `create-account-form.tsx`, `createInternalAccount` action, `?source=wallet`, shared `components/wallet-form.tsx`, `consentFailurePath`). Verify: unit tests for new flow helpers; e2e `internal-account.spec.ts`.
- [ ] 2.4 `/account` dashboard: `InternalAccountCard`, external-wallet card with link form, `LEDGER` rows in `RecentTransactions`. Verify: typecheck, lint, e2e.
- [ ] 2.5 Dictionaries en/es; landing, FAQ, legal copy; `PRODUCT.md` note; `e2e/MANUAL.md` 2a/2b. Verify: `dictionaries.test.ts` parity.

## 3. Contributions from the internal account

- [ ] 3.1 `SeatInput.fundingSource` in `circle.service.ts` (default, `INTERNAL_ACCOUNT_REQUIRED`, `ASSET_MISMATCH`), `routes/circles.ts` `seatFields`, applications carry it. Verify: circles integration tests.
- [ ] 3.2 `period-engine.ts`: `payInternal` and the `OP_WALLET → CIRCLE_POOL` post in `sync`. Verify: test-clock suite — internal circle funds instantly with no Open Payments calls; under-funded member stays PENDING then `DEADLINE_MISSED`; mixed circle pool balance; engine idempotent.
- [ ] 3.3 Frontend join form funding picker, `grantMode` only for external, low-balance hint, actions send `fundingSource`, labels on circle and member pages, asset from `internalAccount.balance`. Verify: unit tests for `join-funding.ts`; typecheck, lint, e2e.

## 4. Deposits

- [ ] 4.1 `services/ledger/deposit.service.ts` (`create`, `get`, `payWithLinkedWallet`), deposit routes, `fakes.settle(url)`. Verify: integration tests — PENDING → COMPLETED once, no double credit, EXPIRED, pay with linked wallet.
- [ ] 4.2 Frontend deposit pages, instructions with `CopyButton`, status refresher, `lib/flows/deposit.ts`. Verify: unit tests; e2e step gated by env; `MANUAL.md` section 6.

## 5. Docs, cleanup, PR ready

- [ ] 5.1 `backend/docs/internal-accounts.md`, `PRODUCT.md`, unify `Amount`/`Money` on `money.ts`, proposal to drop `wallet_balances`. Verify: all suites green on both apps; `nix build .#backend .#frontend` if lockfiles changed.
- [ ] 5.2 Merge `main` into the branch, `gh pr ready`, report phases, verification and risks.
