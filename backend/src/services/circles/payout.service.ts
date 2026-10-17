import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, circleMembers, circles, contributions, payouts, rounds, users, wallets } from "../../db/schema";
import { PaymentRefusedError, type Amount, type PayoutPayments } from "../open-payments/payments";
import type { Tx } from "../wallet.service";
import { planFinalPayouts, planRoundPayouts, type PlannedPayout, type PlanRound } from "./payout-plan";
import { NoPoolGrantError, type PoolAccessService } from "./pool-access";

export type PayoutFailureCode = "NO_WALLET" | "QUOTE_FAILED" | "PAYMENT_REFUSED" | "PAYMENT_FAILED";

export interface PayoutServiceDeps {
  db: Db;
  payments: PayoutPayments;
  pool: Pick<PoolAccessService, "withAccess">;
  /** Real time, for leases and Open Payments expiries. Circle time is the `now` passed in. */
  realNow?: () => Date;
}

// A PROCESSING payout with no saved outgoing payment is only recovered after this long, so a
// run never races another one still between the claim and the payment (same as contributions).
const LEASE_MS = 2 * 60_000;
// How long the member's incoming payment stays open for the pool to pay it; long enough to
// outlast an outage, since a retry reuses it.
const INCOMING_TTL_MS = 7 * 24 * 60 * 60_000;
// Rounds whose collection is over: their pot can be paid out.
const CLOSED: readonly string[] = ["FUNDED", "BLOCKED"];

type PayoutRow = typeof payouts.$inferSelect;
interface Payable {
  payout: PayoutRow;
  walletAddressUrl: string | null;
  poolWalletId: string;
}

const amountOf = (p: Pick<PayoutRow, "value" | "assetCode" | "assetScale">): Amount => ({
  value: p.value.toString(),
  assetCode: p.assetCode,
  assetScale: p.assetScale,
});

/**
 * Pays members from the pot, after the period engine has closed rounds. Same shape as the
 * engine: every step is a compare-and-set on the row it changes, so running it twice (or
 * twice at once) changes nothing more, and Open Payments calls happen outside transactions.
 *
 *   plan     closed rounds → payout rows (PER_ROUND: each round; END: all at the end),
 *            never more than the circle collected
 *   request  PENDING → PROCESSING: open incoming payment on the member's wallet, the pool pays it
 *   sync     PROCESSING → COMPLETED once the member's wallet received what the quote promised
 *   settle   rounds → PAID_OUT, and the circle → COMPLETED once everything is paid
 */
export function createPayouts({ db, payments, pool, realNow = () => new Date() }: PayoutServiceDeps) {
  async function audit(tx: Db | Tx, walletId: string, eventType: string, subjectId: string, amount?: bigint): Promise<void> {
    await tx
      .insert(auditEvents)
      .values({ walletId, eventType, externalId: `${eventType}:${subjectId}`, amount: amount ?? null })
      .onConflictDoNothing({ target: auditEvents.externalId });
  }

  async function plan(circleId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Locked: two runs never plan the same circle at once.
      const [circle] = await tx.select().from(circles).where(eq(circles.id, circleId)).for("update");
      if (!circle || circle.status !== "ACTIVE") return;

      const roundRows = await tx.select().from(rounds).where(eq(rounds.circleId, circleId)).orderBy(asc(rounds.number));
      const contributionRows =
        roundRows.length === 0
          ? []
          : await tx
              .select({ id: contributions.id, roundId: contributions.roundId, memberId: contributions.memberId, value: contributions.value, status: contributions.status })
              .from(contributions)
              .where(
                inArray(
                  contributions.roundId,
                  roundRows.map((r) => r.id),
                ),
              );
      const planRounds: PlanRound[] = roundRows.map((r) => ({
        id: r.id,
        number: r.number,
        beneficiaryMemberId: r.beneficiaryMemberId,
        contributions: contributionRows.filter((c) => c.roundId === r.id),
      }));

      // Rounds whose pot is paid out now, and what that creates.
      let due: { roundIds: string[]; planned: PlannedPayout[] };
      if (circle.payoutMode === "PER_ROUND") {
        const closed = planRounds.filter((r) => CLOSED.includes(roundRows.find((row) => row.id === r.id)?.state ?? ""));
        due = { roundIds: closed.map((r) => r.id), planned: closed.flatMap((r) => planRoundPayouts(r, planRounds, circle.feeBps)) };
      } else {
        // END: only once every round has closed.
        if (roundRows.length === 0 || roundRows.some((r) => !CLOSED.includes(r.state) && r.state !== "PAYING_OUT" && r.state !== "PAID_OUT")) return;
        const closed = roundRows.filter((r) => CLOSED.includes(r.state));
        if (closed.length === 0) return;
        const members = await tx.select({ id: circleMembers.id }).from(circleMembers).where(eq(circleMembers.circleId, circleId));
        due = {
          roundIds: closed.map((r) => r.id),
          planned: planFinalPayouts(
            circleId,
            members.map((m) => m.id),
            planRounds,
            circle.feeBps,
          ),
        };
      }
      if (due.roundIds.length === 0) return;

      // Safety cap: the pot never pays out more than this circle collected (every circle shares
      // one wallet, so overpaying one would spend another's money).
      const existing = await tx.select({ key: payouts.idempotencyKey, value: payouts.value }).from(payouts).where(eq(payouts.circleId, circleId));
      const known = new Set(existing.map((p) => p.key));
      const fresh = due.planned.filter((p) => !known.has(p.key));
      const collected = contributionRows.filter((c) => c.status === "COMPLETED").reduce((sum, c) => sum + c.value, 0n);
      const committed = [...existing, ...fresh].reduce((sum, p) => sum + p.value, 0n);
      if (committed > collected) {
        console.error("Payout cap exceeded: nothing planned", circleId);
        return;
      }

      if (fresh.length > 0) {
        await tx
          .insert(payouts)
          .values(
            fresh.map((p) => ({
              circleId,
              roundId: p.roundId,
              memberId: p.memberId,
              kind: p.kind,
              value: p.value,
              assetCode: circle.assetCode,
              assetScale: circle.assetScale,
              idempotencyKey: p.key,
            })),
          )
          .onConflictDoNothing({ target: payouts.idempotencyKey });
        for (const p of fresh) {
          await audit(tx, circle.poolWalletId, "payout.created", p.key, p.value);
          if (p.fee > 0n) await audit(tx, circle.poolWalletId, "payout.fee", p.key, p.fee);
        }
      }

      // A round with something to pay waits for it (PAYING_OUT); one with nothing is done.
      const paying = new Set(
        due.planned.filter((p) => (p.kind === "ROUND" || p.kind === "FINAL") && p.value > 0n).map((p) => (p.kind === "FINAL" ? "*" : p.roundId)),
      );
      for (const roundId of due.roundIds) {
        const state = paying.has(roundId) || paying.has("*") ? "PAYING_OUT" : "PAID_OUT";
        const [moved] = await tx
          .update(rounds)
          .set({ state })
          .where(and(eq(rounds.id, roundId), inArray(rounds.state, ["FUNDED", "BLOCKED"])))
          .returning({ id: rounds.id });
        if (moved) await audit(tx, circle.poolWalletId, `round.${state.toLowerCase()}`, roundId);
      }
    });
  }

  // Payouts of this circle in `status`, with the member's wallet.
  async function payable(circleId: string, where: ReturnType<typeof and>): Promise<Payable[]> {
    return db
      .select({ payout: payouts, walletAddressUrl: wallets.addressUrl, poolWalletId: circles.poolWalletId })
      .from(payouts)
      .innerJoin(circles, eq(payouts.circleId, circles.id))
      .innerJoin(circleMembers, eq(payouts.memberId, circleMembers.id))
      .innerJoin(users, eq(circleMembers.userId, users.id))
      .leftJoin(wallets, eq(users.opWallet, wallets.id))
      .where(and(eq(payouts.circleId, circleId), where))
      .orderBy(asc(payouts.createdAt));
  }

  async function fail(p: PayoutRow, poolWalletId: string, code: PayoutFailureCode): Promise<void> {
    const [failed] = await db
      .update(payouts)
      .set({ status: "FAILED", failureCode: code })
      .where(and(eq(payouts.id, p.id), inArray(payouts.status, ["PENDING", "PROCESSING"])))
      .returning({ id: payouts.id });
    if (failed) await audit(db, poolWalletId, "payout.failed", p.idempotencyKey);
  }

  async function send({ payout: p, walletAddressUrl, poolWalletId }: Payable, recovering: boolean): Promise<void> {
    if (!walletAddressUrl) return fail(p, poolWalletId, "NO_WALLET");
    try {
      // Inside the pool's access: without a grant nothing is created on the member's wallet.
      const sent = await pool.withAccess(async (access) => {
        // A previous run may have paid and died before saving it: never pay twice.
        const earlier = recovering ? await payments.findPoolPayment(access, p.idempotencyKey) : null;
        if (earlier) return earlier;
        let incomingPaymentUrl = p.incomingPaymentUrl;
        if (!incomingPaymentUrl) {
          ({ url: incomingPaymentUrl } = await payments.createMemberIncomingPayment(walletAddressUrl, {
            key: p.idempotencyKey,
            expiresAt: new Date(realNow().getTime() + INCOMING_TTL_MS),
          }));
          await db.update(payouts).set({ incomingPaymentUrl }).where(eq(payouts.id, p.id));
        }
        return payments.payFromPool(access, { incomingPaymentUrl, key: p.idempotencyKey, debitAmount: amountOf(p) });
      });
      await db
        .update(payouts)
        .set({
          outgoingPaymentUrl: sent.outgoingPaymentUrl,
          quoteUrl: sent.quoteUrl,
          receiveValue: BigInt(sent.receiveAmount.value),
          receiveAssetCode: sent.receiveAmount.assetCode,
          receiveAssetScale: sent.receiveAmount.assetScale,
        })
        .where(eq(payouts.id, p.id));
    } catch (err) {
      // Nobody can pay from the pool yet: wait, untouched, until its owner authorizes it.
      if (err instanceof NoPoolGrantError) {
        await db
          .update(payouts)
          .set({ status: "PENDING", requestedAt: null })
          .where(and(eq(payouts.id, p.id), eq(payouts.status, "PROCESSING"), isNull(payouts.outgoingPaymentUrl)));
        return;
      }
      if (err instanceof PaymentRefusedError) return fail(p, poolWalletId, err.step === "quote" ? "QUOTE_FAILED" : "PAYMENT_REFUSED");
      // Transient (network, 5xx): stays PROCESSING and is recovered after the lease.
      console.error("Payout failed", p.id, err instanceof Error ? err.name : "unknown");
    }
  }

  async function request(circleId: string): Promise<void> {
    for (const item of await payable(circleId, eq(payouts.status, "PENDING"))) {
      // Claim it: only one run moves a payout out of PENDING.
      const [claimed] = await db
        .update(payouts)
        .set({ status: "PROCESSING", requestedAt: realNow() })
        .where(and(eq(payouts.id, item.payout.id), eq(payouts.status, "PENDING")))
        .returning();
      if (claimed) await send({ ...item, payout: claimed }, false);
    }

    const stale = await payable(
      circleId,
      and(eq(payouts.status, "PROCESSING"), isNull(payouts.outgoingPaymentUrl), lt(payouts.requestedAt, new Date(realNow().getTime() - LEASE_MS))),
    );
    for (const item of stale) {
      // Renew the lease before recovering, so a concurrent run skips it.
      const [leased] = await db
        .update(payouts)
        .set({ requestedAt: realNow() })
        .where(and(eq(payouts.id, item.payout.id), eq(payouts.requestedAt, item.payout.requestedAt ?? new Date(0))))
        .returning();
      if (leased) await send({ ...item, payout: leased }, true);
    }
  }

  async function sync(circleId: string, now: Date): Promise<void> {
    const inFlight = await payable(circleId, and(eq(payouts.status, "PROCESSING"), isNotNull(payouts.outgoingPaymentUrl)));
    for (const { payout: p, walletAddressUrl, poolWalletId } of inFlight) {
      if (!walletAddressUrl || !p.incomingPaymentUrl || p.receiveValue === null) continue;
      let received: Amount;
      try {
        ({ received } = await payments.readMemberIncomingPayment(walletAddressUrl, p.incomingPaymentUrl));
      } catch {
        console.error("Payout incoming payment read failed", p.id);
        continue;
      }
      // The proof: the member's wallet received what the quote said it would, in its asset.
      const arrived =
        received.assetCode === p.receiveAssetCode && received.assetScale === p.receiveAssetScale && BigInt(received.value) >= p.receiveValue;
      if (!arrived) {
        // Not there yet; if the pool's payment gave up, it never will.
        const outgoingPaymentUrl = p.outgoingPaymentUrl ?? "";
        const gaveUp = await pool.withAccess((access) => payments.readPoolPayment(access, outgoingPaymentUrl)).catch(() => ({ failed: false }));
        if (gaveUp.failed) await fail(p, poolWalletId, "PAYMENT_FAILED");
        continue;
      }
      const [done] = await db
        .update(payouts)
        .set({ status: "COMPLETED", completedAt: now })
        .where(and(eq(payouts.id, p.id), eq(payouts.status, "PROCESSING")))
        .returning({ id: payouts.id });
      if (!done) continue;
      await audit(db, poolWalletId, "payout.completed", p.idempotencyKey, p.value);
      // Fixed-debit payments leave the incoming payment open; close it. Paid either way.
      await payments.completeMemberIncomingPayment(walletAddressUrl, p.incomingPaymentUrl).catch(() => {
        console.error("Payout incoming payment complete failed", p.id);
      });
    }
  }

  async function settle(circleId: string): Promise<void> {
    const [circle] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
    if (!circle || circle.status !== "ACTIVE") return;
    const all = await db.select({ roundId: payouts.roundId, kind: payouts.kind, status: payouts.status }).from(payouts).where(eq(payouts.circleId, circleId));
    const roundRows = await db.select({ id: rounds.id, state: rounds.state }).from(rounds).where(eq(rounds.circleId, circleId));

    // A round is paid out when the payouts of its pot are (compensations don't hold it back).
    const finalsDone = all.filter((p) => p.kind === "FINAL").every((p) => p.status === "COMPLETED");
    for (const r of roundRows.filter((row) => row.state === "PAYING_OUT")) {
      const own = circle.payoutMode === "END" ? finalsDone : all.filter((p) => p.kind === "ROUND" && p.roundId === r.id).every((p) => p.status === "COMPLETED");
      if (!own) continue;
      const [moved] = await db
        .update(rounds)
        .set({ state: "PAID_OUT" })
        .where(and(eq(rounds.id, r.id), eq(rounds.state, "PAYING_OUT")))
        .returning({ id: rounds.id });
      if (moved) {
        r.state = "PAID_OUT";
        await audit(db, circle.poolWalletId, "round.paid_out", r.id);
      }
    }

    // Done when every round is paid out and nothing is owed to anyone (no FAILED payout left).
    const finished = roundRows.length > 0 && roundRows.every((r) => r.state === "PAID_OUT") && all.every((p) => p.status === "COMPLETED");
    if (!finished) return;
    const [completed] = await db
      .update(circles)
      .set({ status: "COMPLETED" })
      .where(and(eq(circles.id, circleId), eq(circles.status, "ACTIVE")))
      .returning({ id: circles.id });
    if (completed) await audit(db, circle.poolWalletId, "circle.completed", circleId);
  }

  return {
    /** Runs every payout step for one circle; `now` is circle time (real or test clock). Safe to repeat. */
    async payCircle(circleId: string, now: Date): Promise<void> {
      await plan(circleId);
      await request(circleId);
      await sync(circleId, now);
      await settle(circleId);
    },
  };
}

export type PayoutService = ReturnType<typeof createPayouts>;
