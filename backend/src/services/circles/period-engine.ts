import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, circleMembers, circles, contributions, rounds, type FUNDING_SOURCES } from "../../db/schema";
import { poolAccountInTx, userAccountInTx } from "../ledger/internal-account.service";
import { InsufficientFundsError, systemAccountInTx, transferInTx } from "../ledger/ledger.service";
import { PaymentRefusedError, type ContributionPayments } from "../open-payments/payments";
import { NoGrantError, type MemberAccessService } from "./member-access";

export type FailureCode = "NO_GRANT" | "QUOTE_FAILED" | "PAYMENT_REFUSED" | "DEADLINE_MISSED";

export interface PeriodEngineDeps {
  db: Db;
  payments: Omit<ContributionPayments, "rotateToken">;
  memberAccess: Pick<MemberAccessService, "withAccess">;
  /** Real time, for leases and Open Payments expiries. Circle time is the `now` passed in. */
  realNow?: () => Date;
  /** How long a deadline waits for payments still in flight before closing the period. */
  settleWait?: { attempts: number; intervalMs: number };
}

// A PROCESSING contribution with no saved outgoing payment is only recovered after this long,
// so a run never races another one that is still between the claim and the payment.
const LEASE_MS = 2 * 60_000;
// An incoming payment stays open at least this long in real time (circle time may be simulated).
const MIN_INCOMING_TTL_MS = 60 * 60_000;

type ContributionRow = typeof contributions.$inferSelect;
interface Collectable {
  contribution: ContributionRow;
  userId: string;
  deadline: Date;
  circleId: string;
  poolWalletId: string;
  fundingSource: (typeof FUNDING_SOURCES)[number];
}

const contributionAmount = (c: ContributionRow) => ({ value: c.value, assetCode: c.assetCode, assetScale: c.assetScale });

/**
 * Moves a circle's periods forward to `now` (real or test-clock time). Every step is a
 * compare-and-set on the row it changes, so running it twice, or twice at once, changes
 * nothing more. Open Payments calls happen outside any transaction.
 *
 *   open    UPCOMING round whose period started → COLLECTING, one contribution per member
 *   request PENDING contribution → PROCESSING, incoming payment on the pool, member pays it
 *   sync    PROCESSING → COMPLETED once the pool's incoming payment received the amount
 *   close   all COMPLETED → FUNDED; deadline passed → unpaid FAILED, round BLOCKED
 */
export function createPeriodEngine({
  db,
  payments,
  memberAccess,
  realNow = () => new Date(),
  settleWait = { attempts: 15, intervalMs: 1000 },
}: PeriodEngineDeps) {
  async function audit(walletId: string, eventType: string, subjectId: string, amount?: bigint): Promise<void> {
    await db
      .insert(auditEvents)
      .values({ walletId, eventType, externalId: `${eventType}:${subjectId}`, amount: amount ?? null })
      .onConflictDoNothing({ target: auditEvents.externalId });
  }

  async function fail(c: ContributionRow, poolWalletId: string, code: FailureCode): Promise<void> {
    const [failed] = await db
      .update(contributions)
      .set({ status: "FAILED", failureCode: code })
      .where(and(eq(contributions.id, c.id), inArray(contributions.status, ["PENDING", "PROCESSING"])))
      .returning({ id: contributions.id });
    if (failed) await audit(poolWalletId, "contribution.failed", c.id);
  }

  async function open(circle: typeof circles.$inferSelect, now: Date): Promise<void> {
    const due = await db
      .update(rounds)
      .set({ state: "COLLECTING", openedAt: now })
      .where(and(eq(rounds.circleId, circle.id), eq(rounds.state, "UPCOMING"), lte(rounds.startsAt, now)))
      .returning({ id: rounds.id });
    for (const r of due) await audit(circle.poolWalletId, "round.collecting", r.id);

    // Every collecting round has one contribution per member (round 1's were made at start).
    const collecting = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(eq(rounds.circleId, circle.id), eq(rounds.state, "COLLECTING")));
    if (collecting.length === 0) return;
    const seats = await db.select({ id: circleMembers.id }).from(circleMembers).where(eq(circleMembers.circleId, circle.id));
    await db
      .insert(contributions)
      .values(
        collecting.flatMap((r) =>
          seats.map((s) => ({
            roundId: r.id,
            memberId: s.id,
            value: circle.contributionValue,
            assetCode: circle.assetCode,
            assetScale: circle.assetScale,
            idempotencyKey: `contribution:${r.id}:${s.id}`,
          })),
        ),
      )
      .onConflictDoNothing({ target: contributions.idempotencyKey });
  }

  // Contributions of this circle's collecting rounds, with what a payment needs.
  async function collectable(circleId: string, where: ReturnType<typeof and>): Promise<Collectable[]> {
    const rows = await db
      .select({
        contribution: contributions,
        userId: circleMembers.userId,
        deadline: rounds.deadline,
        circleId: rounds.circleId,
        poolWalletId: circles.poolWalletId,
        fundingSource: circleMembers.fundingSource,
      })
      .from(contributions)
      .innerJoin(rounds, eq(contributions.roundId, rounds.id))
      .innerJoin(circles, eq(rounds.circleId, circles.id))
      .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
      .where(and(eq(rounds.circleId, circleId), eq(rounds.state, "COLLECTING"), where))
      .orderBy(asc(rounds.number), asc(contributions.createdAt));
    return rows;
  }

  async function pay({ contribution: c, userId, deadline, poolWalletId }: Collectable, recovering: boolean): Promise<void> {
    try {
      let incomingPaymentUrl = c.incomingPaymentUrl;
      if (!incomingPaymentUrl) {
        const minExpiry = realNow().getTime() + MIN_INCOMING_TTL_MS;
        ({ url: incomingPaymentUrl } = await payments.createIncomingPayment({
          amount: { value: c.value.toString(), assetCode: c.assetCode, assetScale: c.assetScale },
          key: c.idempotencyKey,
          expiresAt: new Date(Math.max(deadline.getTime(), minExpiry)),
        }));
        await db.update(contributions).set({ incomingPaymentUrl }).where(eq(contributions.id, c.id));
      }
      const receiver = incomingPaymentUrl;

      const sent = await memberAccess.withAccess(userId, async (access) => {
        // A previous run may have created the payment and died before saving it: never pay twice.
        const earlier = recovering ? await payments.findMemberPayment(access, c.idempotencyKey) : null;
        return earlier ?? payments.payFromMember(access, { incomingPaymentUrl: receiver, key: c.idempotencyKey });
      });
      await db
        .update(contributions)
        .set({ outgoingPaymentUrl: sent.outgoingPaymentUrl, ...("quoteUrl" in sent ? { quoteUrl: sent.quoteUrl } : {}) })
        .where(eq(contributions.id, c.id));
    } catch (err) {
      if (err instanceof NoGrantError) return fail(c, poolWalletId, "NO_GRANT");
      if (err instanceof PaymentRefusedError) return fail(c, poolWalletId, err.step === "quote" ? "QUOTE_FAILED" : "PAYMENT_REFUSED");
      // Transient (network, 5xx): stays PROCESSING and is recovered after the lease.
      console.error("Contribution payment failed", c.id, err instanceof Error ? err.name : "unknown");
    }
  }

  /**
   * A contribution paid from the member's OpenCircle account: one ledger transfer to the circle's
   * pot, completed in the same transaction (the transfer is the proof). Without enough balance it
   * goes back to PENDING and is retried on every run until the deadline marks it missed.
   */
  async function payInternal({ contribution: c, userId, circleId, poolWalletId }: Collectable, now: Date): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        const [done] = await tx
          .update(contributions)
          .set({ status: "COMPLETED", completedAt: now })
          .where(and(eq(contributions.id, c.id), eq(contributions.status, "PROCESSING")))
          .returning({ id: contributions.id });
        if (!done) return;
        const from = await userAccountInTx(tx, userId);
        if (!from) throw new NoGrantError();
        const pool = await poolAccountInTx(tx, circleId);
        await transferInTx(tx, { key: c.idempotencyKey, kind: "CONTRIBUTION", fromAccountId: from.id, toAccountId: pool.id, amount: contributionAmount(c) });
        await tx
          .insert(auditEvents)
          .values({ walletId: poolWalletId, eventType: "contribution.completed", externalId: `contribution.completed:${c.id}`, amount: c.value })
          .onConflictDoNothing({ target: auditEvents.externalId });
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await db
          .update(contributions)
          .set({ status: "PENDING", requestedAt: null })
          .where(and(eq(contributions.id, c.id), eq(contributions.status, "PROCESSING")));
        await audit(poolWalletId, "contribution.insufficient_funds", c.id);
        return;
      }
      // The seat says internal but the account is gone: nothing can pay it.
      if (err instanceof NoGrantError) return fail(c, poolWalletId, "NO_GRANT");
      console.error("Internal contribution failed", c.id, err instanceof Error ? err.name : "unknown");
    }
  }

  const settle = (item: Collectable, recovering: boolean, now: Date) =>
    item.fundingSource === "INTERNAL_ACCOUNT" ? payInternal(item, now) : pay(item, recovering);

  async function request(circleId: string, now: Date): Promise<void> {
    const pending = await collectable(circleId, eq(contributions.status, "PENDING"));
    for (const item of pending) {
      // Claim it: only one run moves a contribution out of PENDING.
      const [claimed] = await db
        .update(contributions)
        .set({ status: "PROCESSING", requestedAt: realNow() })
        .where(and(eq(contributions.id, item.contribution.id), eq(contributions.status, "PENDING")))
        .returning();
      if (!claimed) continue;
      await audit(item.poolWalletId, "contribution.processing", claimed.id);
      await settle({ ...item, contribution: claimed }, false, now);
    }

    const stale = await collectable(
      circleId,
      and(
        eq(contributions.status, "PROCESSING"),
        isNull(contributions.outgoingPaymentUrl),
        lt(contributions.requestedAt, new Date(realNow().getTime() - LEASE_MS)),
      ),
    );
    for (const item of stale) {
      // Renew the lease before recovering, so a concurrent run skips it.
      const [leased] = await db
        .update(contributions)
        .set({ requestedAt: realNow() })
        .where(and(eq(contributions.id, item.contribution.id), eq(contributions.requestedAt, item.contribution.requestedAt ?? new Date(0))))
        .returning();
      if (leased) await settle({ ...item, contribution: leased }, true, now);
    }
  }

  /** Reads the pool's incoming payments; returns how many contributions are still in flight. */
  async function sync(circleId: string, now: Date): Promise<number> {
    const inFlight = await collectable(circleId, and(eq(contributions.status, "PROCESSING"), isNotNull(contributions.incomingPaymentUrl)));
    let waiting = 0;
    for (const { contribution: c, poolWalletId, circleId } of inFlight) {
      let received: bigint;
      try {
        ({ received } = await payments.readIncomingPayment(c.incomingPaymentUrl ?? ""));
      } catch {
        console.error("Incoming payment read failed", c.id);
        waiting++;
        continue;
      }
      if (received < c.value) {
        waiting++;
        continue;
      }
      // Money really reached OpenCircle's wallet: complete, and mirror it into the circle's pot
      // on the ledger (from the OP_WALLET counterpart) so pool balances are true for both sources.
      const done = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(contributions)
          .set({ status: "COMPLETED", completedAt: now })
          .where(and(eq(contributions.id, c.id), eq(contributions.status, "PROCESSING")))
          .returning({ id: contributions.id });
        if (!row) return false;
        const pool = await poolAccountInTx(tx, circleId);
        const opWallet = await systemAccountInTx(tx, "OP_WALLET", contributionAmount(c));
        await transferInTx(tx, { key: c.idempotencyKey, kind: "CONTRIBUTION", fromAccountId: opWallet.id, toAccountId: pool.id, amount: contributionAmount(c) });
        return true;
      });
      if (done) await audit(poolWalletId, "contribution.completed", c.id, c.value);
    }
    return waiting;
  }

  async function close(circle: typeof circles.$inferSelect, now: Date): Promise<void> {
    const open = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.circleId, circle.id), eq(rounds.state, "COLLECTING")))
      .orderBy(asc(rounds.number));

    for (const round of open) {
      const statuses = await db.select({ status: contributions.status }).from(contributions).where(eq(contributions.roundId, round.id));
      const funded = statuses.length > 0 && statuses.every((s) => s.status === "COMPLETED");
      if (!funded && round.deadline > now) continue;

      if (!funded) {
        // Last chance for payments still in flight, then whoever hasn't paid has missed it.
        for (let i = 0; i < settleWait.attempts && (await sync(circle.id, now)) > 0; i++) await sleep(settleWait.intervalMs);
        const unpaid = await db
          .select()
          .from(contributions)
          .where(and(eq(contributions.roundId, round.id), or(eq(contributions.status, "PENDING"), eq(contributions.status, "PROCESSING"))));
        for (const c of unpaid) await fail(c, circle.poolWalletId, "DEADLINE_MISSED");
      }

      const rest = await db.select({ status: contributions.status }).from(contributions).where(eq(contributions.roundId, round.id));
      const state = rest.length > 0 && rest.every((s) => s.status === "COMPLETED") ? "FUNDED" : "BLOCKED";
      const [closed] = await db
        .update(rounds)
        .set({ state, closedAt: now })
        .where(and(eq(rounds.id, round.id), eq(rounds.state, "COLLECTING")))
        .returning({ id: rounds.id });
      if (closed) await audit(circle.poolWalletId, `round.${state.toLowerCase()}`, round.id);
    }
  }

  return {
    /** Runs every step for one circle at circle time `now`. Safe to repeat. */
    async advanceCircle(circleId: string, now: Date): Promise<void> {
      const [circle] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
      if (!circle || circle.status !== "ACTIVE") return;
      await open(circle, now);
      await request(circle.id, now);
      await sync(circle.id, now);
      await close(circle, now);
    },
  };
}

export type PeriodEngine = ReturnType<typeof createPeriodEngine>;
