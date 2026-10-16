#AI Usage Disclosure

## Tools Used

## Where and How We Used AI

### 1. Backend – Payment flow (`/src/api/open-payments.ts`)

* Used Claude to scaffold the initial Open Payments flow, creating incoming and outgoing payments, as well as quote creation. 

* Reviewed and rewrote error handling ourselves after testing revealed the AI's version didn't handle grants correctly.

### 2. Frontend – Donation platform UI (`/src/components/Donation.tsx`)

* Used Claude to generate all design and frontend pages and components

### 3. Documentation – README setup instructions

## What We Did Ourselves

* Testing and verification of all AI-suggested code

## Prompt Log

**2026-10-16 10:51 · Claude Code**
> we need to follow the AI_USAGE.md get need to log every single prompt to this

**2026-10-16 11:07 · Claude Code**
> in the frontend folder lets create a nextjs + tailwind v4 Next.js + TypeScript Tailwind CSS + shadcn/ui

**2026-10-16 11:09 · Claude Code**
> read about this:
>
>
> <pasted_content id="ce8f">
>
> OpenCircle — Hackathon Proposal (Pool Model)
> Oct 13, 2026 · @Tin Chu
> OpenCircle is a community savings circle (ROSCA) where members pay into a per-circle pool wallet over Open Payments, and the pot is released to the round's beneficiary, minus a fee, only when every contribution is verified and the Safe Round Engine approves.
> What we're building
> OpenCircle is programmable escrow for savings circles. In a ROSCA, a group contributes a fixed amount each round and one member takes the whole pot. OpenCircle runs that cycle on Open Payments and Interledger (ILP).
> • Pool: each circle has its own pool wallet address. Every member, including that round's beneficiary, pays into it.
> • Release: the pot leaves the pool only when all contributions are verified and the Safe Round Engine approves the beneficiary.
> • Fee: OpenCircle keeps a fee from each payout. This is the business model.
> • Interoperability: members pay from any Open Payments wallet. ILP moves the money between providers and currencies.
> • Transparency: every member sees the pool balance, each verified contribution, the fee and the release rule.
> Team: 4 developers. Hackathon: October 16–17, 2026. All payments use test wallets and test funds.
> How a round works
> A round either pays out in full or refunds. Nothing is released halfway.
> 1. Open round. OpenCircle picks the beneficiary from the payout order and creates one incoming payment on the pool wallet per member.
> 2. Collect. Each member pays their contribution into the pool. Their wallet must approve it, either once at join (recurring grant) or per round.
> 3. Verify. OpenCircle reads each incoming payment on its own pool wallet until receivedAmount reaches the expected amount.
> 4. Check. When all members are verified, the Safe Round Engine checks the beneficiary's remaining obligations against their coverage.
> 5. Pay out. If approved, the pool pays pot − fee to the beneficiary. The fee stays in the pool as OpenCircle revenue.
> 6. Fallback. A missing contribution at the deadline means the round stays COLLECTING or is refunded. A failed risk check means the round is BLOCKED and the funds stay held until coverage is added.
> State
> Meaning
> Next
> COLLECTING
> Waiting for contributions
> FUNDED, REFUNDED
> FUNDED
> All contributions verified in the pool
> RISK_CHECK
> RISK_CHECK
> Safe Round Engine evaluating the beneficiary
> PAYING_OUT, BLOCKED
> BLOCKED
> Beneficiary not covered; funds held
> RISK_CHECK (after coverage added), REFUNDED
> PAYING_OUT
> Payout sent, waiting for confirmation
> PAID_OUT
> PAID_OUT
> Beneficiary received the pot minus fee
> —
> REFUNDED
> Contributions returned to members
> —
> Example: five-person circle
> Each round collects 100,000 COP from five real payments and releases 98,000 COP to the beneficiary at a 2% fee.
> Member
> Contribution per round (COP)
> Payout round
> Alice
> 20,000
> 1
> Bob
> 20,000
> 2
> Charlie
> 20,000
> 3
> Diana
> 20,000
> 4
> Edward
> 20,000
> 5
> Per round
> COP
> Collected into pool (5 × 20,000)
> 100,000
> OpenCircle fee (2%)
> −2,000
> Paid out to beneficiary
> 98,000
> Over five rounds each member pays 100,000 COP and receives 98,000 COP. Contributions are fixed-receive: the member's wallet pays any ILP network fee on top, so the pool always receives exactly 20,000. Network fees on the payout come out of OpenCircle's 2,000.
> The 2% fee rate and COP availability are placeholders until confirmed (see Open questions).
> Open Payments integration
> OpenCircle is an Open Payments client. It signs every request with the platform's own key and owns one pool wallet address per circle. There are three flows.
> Collect (member → pool), per contribution
> 1. Request an incoming-payment grant on the pool wallet's auth server (non-interactive).
> 2. Create an incoming payment on the pool for 20,000. Store its id on the contribution. It is the idempotency key.
> 3. Request a quote grant on the member's auth server and create a quote with receiveAmount = 20,000 (fixed-receive).
> 4. Use the member's outgoing payment grant. Preferred: one interactive grant at join with limits.debitAmount + limits.interval covering all rounds. Fallback: one interactive grant per contribution.
> 5. Create the outgoing payment from the quote before the quote expires. Re-quote if it has.
> Payout (pool → beneficiary)
> 1. Create an incoming payment on the beneficiary's wallet for pot − fee (non-interactive).
> 2. Create a quote from the pool wallet with that receiveAmount.
> 3. Create the outgoing payment with the platform's own pool grant. This grant is approved once during setup with a high debitAmount and an interval, and its token is refreshed with client.token.rotate.
> Refund (pool → member)
> Same shape as payout, one per contribution being returned. No OpenCircle fee is charged on refunds.
> Rules for every flow
> • Interactive grants: the redirect callback carries interact_ref and hash. Verify hash against the client nonce, the auth server's finish nonce, interact_ref and the grant URL before calling grant.continue.
> • Persistence: store nonce, continue URI, continue token, quote id, incoming payment id and outgoing payment id in a PaymentAttempt row.
> • Verification: poll the incoming payment (receivedAmount, completed) and the outgoing payment (sentAmount, failed). Rafiki webhooks go to the wallet operator, not to us.
> • Secrets: the private key and all access tokens live server-side only.
> Safe Round Engine
> The pool lets the engine actually hold the payout. A beneficiary is released the pot only when their uncovered future obligations are at or below a group-set threshold (default: one contribution, 20,000 COP).
> Coverage has two sources:
> • Collateral held in the pool: test funds the member deposits into the pool, returned when the circle ends. Counts 100%.
> • Active recurring grant: the member's wallet-approved authorization for future rounds. It can be revoked, so it counts 50%. This weight is a policy assumption for the demo, not a guarantee.
> We do not require full coverage. Full coverage would mean Alice needs 80,000 COP up front to receive 98,000 in round 1, which defeats the point of a ROSCA.
> Case
> Owes (COP)
> Collateral
> Grant (×0.5)
> Uncovered
> Decision
> Bob, round 2, collateral only
> 60,000
> 20,000
> 0
> 40,000
> BLOCKED
> Bob, round 2, collateral + grant
> 60,000
> 20,000
> 30,000
> 10,000
> ELIGIBLE
> Alice, round 1, grant only
> 80,000
> 0
> 40,000
> 40,000
> BLOCKED
> Alice, round 1, collateral + grant
> 80,000
> 20,000
> 40,000
> 20,000
> ELIGIBLE
> Edward, round 5
> 0
> 0
> 0
> 0
> ELIGIBLE
> A blocked beneficiary's pot stays in the pool. The round returns to RISK_CHECK when they add collateral or a grant. If the group deadline passes, contributions are refunded. Missed future contributions are covered first from that member's collateral; anything beyond it is reported as a default, not recovered.
> Custody, compliance and trust
> The pool model means OpenCircle holds members' money, so in production the pool must be operated by a licensed partner. In Colombia, taking and holding money from the public without authorization is captación ilegal (Código Penal, Art. 316) and falls under Superintendencia Financiera oversight. The hackathon uses test funds only.
> Our answer to judges:
> In production, each circle's pool wallet is held by a licensed financial institution that supports Open Payments. Because Open Payments is a standard, moving custody to that partner changes one wallet address, not our code. The partner holds the funds; OpenCircle runs the rules.
> Trust: a ROSCA usually fails when the organizer disappears with the pot, and in this model OpenCircle is the organizer. We counter that with:
> • Separate pools: one pool wallet address per circle. Funds are never mixed across circles.
> • Visible balance: every member sees the pool balance and each verified incoming payment.
> • Fixed release rule: shown in the app and applied automatically (all contributions verified + engine approval).
> • Fee shown up front: displayed before members join and on every payout.
> Known costs of the pool: money takes two hops (member → pool → beneficiary), so network fees apply twice. Cross-currency circles would convert twice, so each demo circle uses a single currency.
> Core features
> Feature
> Description
> Priority
> Create circle
> Members, contribution amount, payout order, fee, pool wallet address
> P0
> Member onboarding
> Add wallet address; approve outgoing grant (recurring if supported)
> P0
> Collect contributions
> Member → pool payments over Open Payments
> P0
> Payment verification
> Poll incoming and outgoing payments; idempotent ledger entries
> P0
> Round state machine
> COLLECTING → FUNDED → RISK_CHECK → PAID_OUT / BLOCKED / REFUNDED
> P0
> Payout with fee
> Pool → beneficiary for pot − fee
> P0
> Circle dashboard
> Pool balance, contributions, fee, round status
> P0
> Safe Round Engine
> Coverage vs obligations; holds payout when uncovered
> P1
> Refunds
> Pool → members when a round fails
> P1
> Collateral deposits
> Member → pool collateral, returned at circle end
> P1
> Trust score
> Reliability from payment history
> P2
> Gamification
> Levels and achievements
> P2
> Technology stack
> Component
> Technology
> Frontend
> Next.js + TypeScript
> UI
> Tailwind CSS + shadcn/ui
> Backend
> Next.js route handlers (Node.js)
> Database
> PostgreSQL + Prisma
> Payments
> @interledger/open-payments SDK
> Wallets
> Interledger Test Wallet (members, pool wallets, platform)
> Background work
> Poller for payment status and round transitions
> Deployment
> Vercel + hosted Postgres
> The backend runs inside the Next.js app so there is one deploy instead of two (Vercel + Railway). The poller can run as a cron route or as a small worker if we need tighter timing. No custom wallet and no Rafiki deployment.
> Team responsibilities
> Developer
> Owns
> 1 — Payments & architecture
> Pool wallet setup; collect, payout and refund flows; grant handling with hash verification; token rotation; payment status poller; PaymentAttempt model
> 2 — Backend
> Circles, members, rounds; round state machine; ledger; fee calculation; Safe Round Engine and collateral accounting
> 3 — Frontend
> Circle creation, onboarding and grant approval redirect; dashboard with pool balance, progress and fee breakdown; blocked and refunded states
> 4 — QA, integration & pitch
> Wallet test accounts; end-to-end scenarios A–C; compliance and custody-partner slide; demo script and pitch
> Developers 1 and 2 agree on the payments service interface first: createIncoming, createQuote, requestOutgoingGrant, continueGrant, createOutgoing, getStatus.
> Development phases
> When
> Phase
> Done when
> Before Oct 16
> 0 — Preparation
> Test wallets created (5 members, 1 pool, platform key); sample peer-to-peer script runs end to end; recurring interval grant tested; COP availability checked
> Oct 16 morning
> 1 — Payments
> One member → pool payment and one pool → beneficiary payout succeed from our code
> Oct 16 afternoon
> 2 — ROSCA engine
> Circles, members, rounds, state machine and ledger working against the payments service
> Oct 16 evening
> 3 — Integration
> Frontend drives a full round: onboarding, collect, verify, payout
> Oct 17 morning
> 4 — Security
> Safe Round Engine blocks and releases; refunds work; hash verification in place
> Oct 17 midday
> 5 — Testing
> Scenarios A, B and C pass on fresh test data
> Oct 17 afternoon
> 6 — Submission
> Public repo, README, demo recording, pitch
> Demo scenarios
> A — Successful round. All five members pay 20,000 COP into the pool. The dashboard shows 5/5 verified and a 100,000 balance. The engine approves, and the beneficiary receives 98,000 with the 2,000 fee shown.
> B — Missing payment. Four members pay and one does not. The pool holds 80,000, the round stays COLLECTING, and no payout is possible. At the deadline the 80,000 is refunded to the four payers.
> C — Risk prevention. The pool is fully funded for Bob's round 2, but he has 60,000 in future obligations and only 20,000 collateral. The engine marks the round BLOCKED and the 100,000 stays in the pool. Bob approves a recurring grant, uncovered exposure drops to 10,000, and the payout is released.
> What we are not building
> • Our own Interledger wallet or a Rafiki deployment
> • Custody of real money (test funds only; production custody goes to a licensed partner)
> • Real credit underwriting or BNPL
> • Blockchain or smart contracts
> • Automated debt collection beyond applying a member's own collateral
> • Cross-currency circles (each demo circle uses one currency)
> Success criteria
> [ ] A circle with five members and its own pool wallet
> [ ] Five member → pool contributions verified over Open Payments
> [ ] A payout of pot − fee from the pool to the beneficiary
> [ ] A dashboard showing pool balance, contributions, fee and round state
> [ ] Scenario B: incomplete round held, then refunded
> [ ] Scenario C: payout blocked, then released after coverage is added
> [ ] Public repository with a README that states test-funds-only and the custody-partner model
> Open questions
> [ ] Does the Interledger Test Wallet support limits.interval on outgoing payment grants? This decides between one approval at join and one per round.
> [ ] Does the test wallet offer COP accounts? If not, run the demo in USD/EUR/MXN and show COP equivalents, labeled as such.
> [ ] Does the pool's own outgoing grant need interactive approval? If so, approve it once during setup.
> [ ] What is the fee rate: 2% or a flat amount?
> [ ] Are the uncovered-exposure threshold (one contribution) and the 50% grant weight fixed, or set per circle?
> [ ] How long is the round deadline before a refund (demo: minutes; product: days)?
> Vision: OpenCircle — Save together. Pay anywhere. Interoperable payments plus programmable escrow make community savings transparent and safe across wallets.
> </pasted_content id="ce8f">
>
>
> we are going to focus on the frontend.
> lets make this a solution to save money and earn yield interest, trust and reviews

**2026-10-16 11:14 · Claude Code**
> here is the svg offthe interledger logo:
>
>
> <pasted_content id="ce8f">
> <g stroke="currentColor" stroke-miterlimit="10" stroke-width="1.01"> <path fill="transparent" d="M 32.749 27.749 C 32.749 27.749 32.755 27.746 32.758 27.744 L 32.758 27.738 C 32.758 27.738 32.752 27.746 32.749 27.749 Z M 32.749 12.175 C 32.749 12.175 32.755 12.183 32.758 12.186 L 32.758 12.18 C 32.758 12.18 32.752 12.177 32.749 12.175 Z M 7.172 27.744 C 7.172 27.744 7.177 27.746 7.18 27.749 C 7.18 27.746 7.175 27.741 7.172 27.738 Z M 7.175 12.186 C 7.175 12.186 7.18 12.177 7.183 12.175 C 7.18 12.175 7.177 12.175 7.175 12.18 Z M 19.966 4.997 C 22.814 4.997 25.476 5.792 27.741 7.172 L 27.746 7.172 C 25.969 4.265 23.225 2.011 19.966 0.856 C 16.704 2.011 13.963 4.265 12.186 7.172 L 12.192 7.172 C 14.456 5.792 17.118 4.997 19.966 4.997 Z"></path> <path fill="transparent" d="M 27.741 7.172 C 25.476 5.792 22.814 4.997 19.966 4.997 C 17.118 4.997 14.456 5.792 12.192 7.172 C 14.93 7.769 17.546 8.752 19.966 10.124 C 22.386 8.752 25.003 7.769 27.741 7.172 Z M 34.932 19.963 C 34.932 22.811 34.138 25.473 32.758 27.738 L 32.758 27.744 C 35.665 25.966 37.918 23.223 39.073 19.963 C 37.918 16.701 35.665 13.961 32.758 12.183 L 32.758 12.189 C 34.138 14.454 34.932 17.115 34.932 19.963 Z"></path> <path fill="transparent" d="M 32.755 27.738 C 34.135 25.473 34.93 22.811 34.93 19.963 C 34.93 17.115 34.135 14.454 32.755 12.189 C 32.158 14.927 31.175 17.544 29.803 19.963 C 31.175 22.383 32.158 25 32.755 27.738 Z"></path> <path fill="transparent" d="M 37.383 6.617 C 36.3 5.01 34.917 3.627 33.31 2.544 C 30.927 0.938 28.054 0 24.961 0 C 23.208 0 21.527 0.301 19.963 0.856 C 23.225 2.011 25.966 4.265 27.744 7.172 C 27.744 7.175 27.744 7.177 27.749 7.18 C 29.788 8.426 31.501 10.139 32.746 12.177 C 32.749 12.177 32.752 12.18 32.755 12.183 C 35.662 13.961 37.915 16.704 39.07 19.963 C 39.638 18.358 39.927 16.668 39.927 14.966 C 39.927 11.873 38.989 9.003 37.383 6.617 Z"></path> <path fill="transparent" d="M 27.752 7.18 C 27.752 7.18 27.749 7.175 27.746 7.172 L 27.741 7.172 C 27.741 7.172 27.749 7.177 27.752 7.18 Z"></path> <path fill="transparent" d="M 32.749 12.175 C 31.504 10.136 29.791 8.423 27.752 7.177 C 27.749 7.177 27.744 7.172 27.741 7.169 C 25.003 7.766 22.386 8.749 19.966 10.121 C 20.231 10.273 20.496 10.428 20.758 10.589 C 22.363 11.577 23.857 12.736 25.214 14.045 C 25.442 14.259 25.665 14.482 25.879 14.71 C 27.403 16.287 28.721 18.05 29.803 19.958 C 31.175 17.538 32.158 14.921 32.755 12.183 C 32.755 12.183 32.749 12.175 32.746 12.172 L 32.749 12.172 Z M 5 19.963 C 5 17.115 5.794 14.454 7.175 12.189 L 7.175 12.183 C 4.268 13.961 2.014 16.704 0.859 19.963 C 2.014 23.225 4.268 25.966 7.175 27.744 L 7.175 27.738 C 5.794 25.473 5 22.811 5 19.963 Z"></path> <path fill="transparent" d="M 7.175 12.186 C 5.794 14.451 5 17.113 5 19.961 C 5 22.808 5.794 25.47 7.175 27.735 C 7.772 24.997 8.755 22.38 10.127 19.961 C 8.755 17.541 7.772 14.924 7.175 12.186 Z M 19.966 34.93 C 17.118 34.93 14.456 34.135 12.192 32.755 L 12.186 32.755 C 13.963 35.662 16.707 37.915 19.966 39.07 C 23.228 37.915 25.969 35.662 27.746 32.755 L 27.741 32.755 C 25.476 34.135 22.814 34.93 19.966 34.93 Z"></path> <path fill="transparent" d="M 12.189 32.752 C 14.454 34.132 17.115 34.927 19.963 34.927 C 22.811 34.927 25.473 34.132 27.738 32.752 C 25 32.155 22.383 31.172 19.963 29.8 C 17.544 31.172 14.927 32.155 12.189 32.752 Z"></path> <path fill="transparent" d="M 12.183 32.755 C 12.183 32.755 12.18 32.749 12.177 32.746 C 10.139 31.501 8.426 29.788 7.18 27.749 C 7.177 27.749 7.175 27.746 7.172 27.744 C 4.265 25.966 2.011 23.223 0.856 19.963 C 0.289 21.568 -0.001 23.258 0 24.961 L 0.003 24.961 C 0.003 28.054 0.941 30.924 2.546 33.31 C 3.628 34.915 5.014 36.301 6.62 37.383 C 9.006 38.989 11.879 39.927 14.969 39.927 C 16.721 39.927 18.403 39.625 19.966 39.07 C 16.704 37.915 13.963 35.662 12.186 32.755 Z"></path> <path fill="transparent" d="M 12.177 32.746 C 12.177 32.746 12.177 32.752 12.183 32.755 L 12.189 32.755 C 12.189 32.755 12.18 32.749 12.177 32.746 Z M 19.175 29.332 C 17.57 28.346 16.076 27.188 14.721 25.879 C 14.49 25.662 14.268 25.439 14.051 25.208 C 12.529 23.631 11.212 21.869 10.13 19.963 C 8.758 22.383 7.775 25 7.177 27.738 C 7.177 27.741 7.183 27.746 7.186 27.749 C 8.432 29.788 10.144 31.501 12.183 32.746 C 12.183 32.746 12.192 32.752 12.194 32.755 C 14.932 32.158 17.552 31.175 19.969 29.803 C 19.704 29.651 19.439 29.496 19.177 29.335 L 19.175 29.335 Z M 14.969 0 C 11.876 0 9.006 0.938 6.62 2.544 C 5.013 3.627 3.63 5.01 2.546 6.617 C 0.884 9.084 -0.002 11.992 0.003 14.966 C 0.003 16.718 0.304 18.4 0.859 19.963 C 2.014 16.701 4.268 13.961 7.175 12.183 C 7.177 12.183 7.18 12.183 7.183 12.177 C 8.429 10.139 10.142 8.426 12.18 7.18 C 12.18 7.177 12.183 7.175 12.186 7.172 C 13.963 4.265 16.707 2.011 19.966 0.856 C 18.361 0.289 16.671 -0.001 14.969 0 Z"></path> <path fill="transparent" d="M 12.192 7.172 L 12.186 7.172 C 12.186 7.172 12.186 7.177 12.18 7.18 C 12.183 7.18 12.189 7.175 12.192 7.172 Z"></path> <path fill="transparent" d="M 12.192 7.172 C 12.192 7.172 12.183 7.177 12.18 7.18 C 10.142 8.426 8.429 10.139 7.183 12.177 C 7.183 12.18 7.177 12.186 7.175 12.189 C 7.772 14.927 8.755 17.544 10.127 19.963 C 10.279 19.699 10.434 19.434 10.594 19.172 C 11.582 17.566 12.741 16.071 14.051 14.715 C 14.268 14.485 14.49 14.262 14.718 14.048 C 16.096 12.721 17.589 11.569 19.175 10.592 C 19.437 10.431 19.699 10.276 19.966 10.124 C 17.546 8.752 14.93 7.769 12.192 7.172 Z M 39.073 19.963 C 37.918 23.225 35.665 25.966 32.758 27.744 C 32.755 27.744 32.752 27.746 32.749 27.749 C 31.504 29.788 29.791 31.501 27.752 32.746 C 27.752 32.749 27.749 32.752 27.746 32.755 C 25.969 35.662 23.225 37.915 19.966 39.07 C 21.571 39.638 23.261 39.927 24.963 39.927 C 28.056 39.927 30.927 38.989 33.313 37.383 C 34.918 36.301 36.304 34.915 37.386 33.31 C 38.992 30.924 39.93 28.051 39.93 24.961 C 39.93 23.208 39.628 21.527 39.073 19.963 Z"></path> <path fill="transparent" d="M 27.741 32.752 L 27.746 32.752 C 27.746 32.752 27.749 32.746 27.752 32.744 C 27.749 32.744 27.744 32.749 27.741 32.752 Z"></path> <path fill="transparent" d="M 29.803 19.963 C 28.721 21.871 27.403 23.634 25.879 25.211 C 25.662 25.442 25.439 25.665 25.208 25.882 C 23.852 27.191 22.357 28.349 20.752 29.338 C 20.49 29.499 20.228 29.654 19.961 29.806 C 22.38 31.177 24.997 32.161 27.735 32.758 C 27.738 32.758 27.744 32.752 27.746 32.749 C 29.785 31.504 31.498 29.791 32.744 27.752 C 32.744 27.752 32.749 27.744 32.752 27.741 C 32.155 25.003 31.172 22.386 29.8 19.966 L 29.803 19.966 Z"></path> </g>
> </pasted_content id="ce8f">
>
>
> we need to use that in the "O" for the logo its going to be called OpenCircle

**2026-10-16 11:14 · Claude Code**
> the font family is Poppins

**2026-10-16 11:15 · Claude Code**
> after we build this , lets make this push and start checking that

**2026-10-16 11:17 · Claude Code**
> with this:
>
>
> <pasted_content id="ce8f">
> ---
> name: brand
> description: Brand rules for every user-visible change in this repository — colours, typography, logos, Tailwind tokens, contrast, the two surfaces that cannot read Tailwind (the OG image and the demo-request email) and the migrate-on-touch rule for the off-palette code that exists today. Use it whenever the user asks for UI, layout, styling, colours, fonts, logos, icons, a new section or component, the 404 page, the OG image, the email template, a "re-skin", "look and feel", "diseño", "colores" or "estilos", even without the word "brand".
> ---
>
> # Brand for the OpenCircle
>
> The brand is defined once, for the whole MDGeniusAI/OpenCircle family. This skill adapts it to a marketing site; when the two disagree, that file wins. Colours, typefaces and logos are brand decisions, not styling preferences: never invent a hex value, never substitute a font, never draw a logo.
>
> This file is the whole brand contract for this repo; `CLAUDE.md` only points here.
>
> ## Palette
>
> | Role      | Name            | Hex       |
> | --------- | --------------- | --------- |
> | Primary   | Baltic Blue     | `#3A607D` |
> | Primary   | Deep Space Blue | `#082B42` |
> | Primary   | Cool Steel      | `#97B7C1` |
> | Secondary | White Smoke     | `#F3F3F3` |
> | Secondary | Grey            | `#7F7F7F` |
> | Secondary | Black           | `#000000` |
>
> ## Typography
>
> - **Space Grotesk** (primary): titles, leads, display figures.
> - **Helvetica** (secondary): paragraphs, buttons, links.
>
> Nothing else. Sora, Manrope and JetBrains Mono are loaded today (see "Current state") and are not brand fonts.
>
> ## Logos
>
> Both files in `public/` are byte-identical copies of the OpenCircle app's `services/client/public/icons/` assets. Keep them in sync; never edit them here.
>
> | Asset                                     | Path                                            |
> | ----------------------------------------- | ----------------------------------------------- |
> | Full logo with text, flat Deep Space Blue | `public/OpenCircle.svg`                               |
> | Mark only, flat Deep Space Blue           | `public/OpenCircle-logo-alone.svg` (also the favicon) |
>
> The header renders `OpenCircle.svg` in white with `brightness-0 invert` on a dark bar. That is the one sanctioned recolour; it keeps the artwork intact. Otherwise never recolour a logo to fit a background: change the background. The OG image draws a "simple representation of the logo mark" with inline SVG; that is a drawn logo and must be replaced by the real asset when the image is next touched.
>
> ## Where the tokens live
>
> - **Tailwind is the only place a colour or font family is defined.** `tailwind.config.ts` holds the palette (`primary`, `primary-container`, `surface*`, `on-surface*`, `outline*`) and the type scale (`font-headline-*`, `font-body-*`, `font-label-md`, `font-lead` with matching `text-*` sizes). Components consume those classes. If the token you need is missing, add it there, once, with its brand name in a comment, instead of writing `bg-[#...]` in a component.
> - **A brand change must be one edit, not a global grep.** If changing Baltic Blue would touch more than the token definition, the palette has leaked; fix the leak while you are there.
> - **Two surfaces cannot read Tailwind and are allowed inline values:** `app/opengraph-image.tsx` (rendered by Satori through `ImageResponse`; flexbox subset only, every multi-child element needs `display: 'flex'`) and the HTML email in `app/api/send-demo-request/route.ts`. Inline styles there must still be brand hex values, each annotated with the brand name. The email rules from the OpenCircle app apply to that template: styles inline on the element, no SVG, no remote images.
> - **Check contrast before shipping.** Every text/background pair must clear WCAG AA (4.5:1 normal text, 3:1 large). On Baltic Blue `#3A607D`: White Smoke is 6.0:1, white is 4.9:1, Cool Steel is 2.2:1 (**fails**, never use it for text on Baltic Blue). Cool Steel on White Smoke also fails for body text; it is a tint for surfaces, borders and badges.
> - **Bilingual copy is a brand surface too.** Any new string goes into both `app/locales/en.json` and `es.json` in the same change, read through `useTranslation().t`.
>
> ## Current state, and the rule that follows from it
>
> The landing was built before the brand guideline was adopted and has not been re-skinned. Read the code before assuming it matches the palette above:
>
> - `tailwind.config.ts` is a Material-3 style token set plus a `brand` group that carries the six guideline colours by name: `brand-baltic-blue`, `brand-deep-space-blue`, `brand-cool-steel`, `brand-white-smoke`, `brand-grey`, `brand-black` (usable as `bg-`, `text-`, `border-`, with `/NN` opacity). New work uses the `brand-*` tokens. Of the Material tokens only `primary-container` (`#3a607d`) is a brand colour; `primary` is `#204864`.
> - A **teal accent `#12b5a6`** (about fifteen literal uses in `OpenCircleLandingClient.tsx`, `header.tsx`, `languageSwitch.tsx`, `globals.css`, the OG image and the demo email), several **dark navies** (`#07162c`, `#0a1e36`, `#0b192c`, `#13243a`, `#0f172a`, `#00364e`), a green `#006a61` and a purple/teal pair on the pricing badges are all off-palette and all inlined as `bg-[#...]` or `style={{}}`.
> - Sora, Manrope and JetBrains Mono are loaded from Google Fonts alongside Space Grotesk and used by the `headline-xl`, `headline-lg-mobile`, `body-sm` and `code-mono` tokens. Icons are Google Material Symbols, also loaded from Google Fonts.
> - `NotFoundContent.tsx` (the 404 body; `not-found.tsx` is only its server shell) is the reference for a fully migrated component: `brand-*` colours only, Space Grotesk through `font-headline-*` for the figure and title, Helvetica through `font-body-*` for paragraph, button and footer, no inline styles, no hex literal. Its badge shows the Cool Steel rule in practice: Cool Steel at 20 % as the background, Baltic Blue as the text (5.8:1).
> - `opengraph-image.tsx` uses `#00364e`, `#12b5a6` and `#006a61` and a hand-drawn logo mark.
>
> Rules for agents given that state:
>
> 1. **Never add a new off-palette literal or font.** New work uses the brand palette through the `brand-*` Tailwind tokens; if a role token you need (a brand-named surface or text scale) is missing, add it to `tailwind.config.ts` once, with its brand name in a comment.
> 2. **Migrate on touch.** When you edit a component for another reason, replace the literals in the block you are editing with tokens; do not leave them in place, and do not expand the edit into a page-wide restyle.
> 3. **A full re-skin is a deliberate, separate task**, agreed with the user, with the font swap, the move to `next/font` and the CSP `font-src`/Google Fonts links handled together. Do not start it as a side effect of a bug fix.
>
> ## Checklist before finishing a visual change
>
> - No new `#` literal outside `tailwind.config.ts`, the OG image and the email template.
> - No new font family anywhere.
> - Every new string exists in both locale files.
> - Contrast checked for every new text/background pair.
> - Logos untouched; the header's white inversion is the only recolour.
> - `npx eslint <touched files>` clean and `npm run build` green.
> </pasted_content id="ce8f">
>
>
> I we need to create that into the repo

**2026-10-16 11:23 · Claude Code**
> lets start creating the supabase integration:
>
>
> <pasted_content id="6069">
> SUPABASE_URL=https://qqjfxapqjhnfsegiwqwl.supabase.co
> SUPABASE_PUBLISHABLE_KEY=[REDACTED]
> SUPABASE_SECRET_KEY=[REDACTED]
> SUPABASE_JWKS_URL=https://qqjfxapqjhnfsegiwqwl.supabase.co/auth/v1/.well-known/jwks.json
> </pasted_content id="6069">
>
>
> in the frontend

**2026-10-16 11:28 · Claude Code**
> and those vars

**2026-10-16 11:30 · Claude Code**
> <task-notification>
> <task-id>bx2iyb0sq</task-id>
> <tool-use-id>toolu_01DxZM9d1XW4obqYW4sAN5mM</tool-use-id>
> <output-file>/private/tmp/claude-501/-Users-tinhochu-projects-hackathon-open-payments/75526683-c351-4d29-8fd5-c2ca1a448ca4/tasks/bx2iyb0sq.output</output-file>
> <status>failed</status>
> <summary>Background command "Start production server on port 3100" failed with exit code 143</summary>
> </task-notification>

**2026-10-16 11:31 · Claude Code**
> yes add vitest

**2026-10-16 11:31 · Claude Code**
> yes commit it

**2026-10-16 11:32 · Claude Code**
> 1. no rotation.

**2026-10-16 11:34 · Claude Code**
> fix the proxy first, then push

**2026-10-16 11:34 · Claude Code**
> push what we have right now

**2026-10-16 11:38 · Claude Code**
> commit in the same PR

**2026-10-16 11:39 · Claude Code**
> yes fix both in the same PR

**2026-10-16 11:40 · Claude Code**
> push the PR
