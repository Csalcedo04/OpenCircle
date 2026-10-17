import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { auditEvents, circleMembers, circles, contributions, payouts, rounds, testClocks } from "../../db/schema";
import { AppError } from "../../errors/app-error";
import { PaymentRefusedError, type ContributionPayments } from "../open-payments/payments";
import type { AmountDto, Tx } from "../wallet.service";
import { isOpenDebt } from "./debts";
import { NoGrantError, type MemberAccessService } from "./member-access";
import { afterFee } from "./payout-plan";

export interface DebtDto {
  contributionId: string;
  circleId: string;
  circleName: string;
  roundNumber: number;
  amount: AmountDto;
  deadline: string;
  /** OWED until paid; PAYING while the payment is on its way. */
  status: "OWED" | "PAYING";
}

export interface DebtServiceDeps {
  db: Db;
  payments: Pick<ContributionPayments, "createIncomingPayment" | "readIncomingPayment" | "payFromMember" | "findMemberPayment">;
  memberAccess: Pick<MemberAccessService, "withAccess">;
  /** Real time, for leases and Open Payments expiries. */
  realNow?: () => Date;
  /** How long `pay` waits for the money to arrive before leaving it to the next tick. */
  settleWait?: { attempts: number; intervalMs: number };
}

// Same lease as contributions: a PROCESSING payment with no saved outgoing payment is only
// recovered after this long, so a run never races another one between the claim and the payment.
const LEASE_MS = 2 * 60_000;
const INCOMING_TTL_MS = 60 * 60_000;

// A defaulted contribution being paid: PROCESSING in a round that has closed, default recorded.
const isDebtInFlight = and(
  eq(contributions.status, "PROCESSING"),
  ne(rounds.state, "COLLECTING"),
  sql`exists (select 1 from ${auditEvents} where ${auditEvents.externalId} = 'score.defaulted:' || ${contributions.id}::text)`,
);

const notFound = () => new AppError(404, "DEBT_NOT_FOUND", "Debt not found");

/**
 * Paying a defaulted contribution late. The one way a contribution leaves FAILED: FAILED →
 * PROCESSING → COMPLETED, only here and only for an open debt. It is collected like any
 * contribution (incoming payment on the pool, the member pays it through their grant, the pool's
 * record is the proof), under its own Open Payments key so the dead first attempt is never
 * mistaken for it. Once paid, the beneficiary who received less is compensated, scoring
 * re-scores it as late (undoing the default) and the block on new circles lifts.
 */
export function createDebtService({ db, payments, memberAccess, realNow = () => new Date(), settleWait = { attempts: 10, intervalMs: 1000 } }: DebtServiceDeps) {
  type Row = Awaited<ReturnType<typeof debtRows>>[number];

  const keyOf = (contributionId: string) => `debt:${contributionId}`;

  function debtRows(where: ReturnType<typeof and>) {
    return db
      .select({
        contribution: contributions,
        userId: circleMembers.userId,
        circleId: circles.id,
        circleName: circles.name,
        poolWalletId: circles.poolWalletId,
        feeBps: circles.feeBps,
        testClockId: circles.testClockId,
        roundNumber: rounds.number,
        deadline: rounds.deadline,
        beneficiaryMemberId: rounds.beneficiaryMemberId,
      })
      .from(contributions)
      .innerJoin(rounds, eq(contributions.roundId, rounds.id))
      .innerJoin(circles, eq(rounds.circleId, circles.id))
      .innerJoin(circleMembers, eq(contributions.memberId, circleMembers.id))
      .where(where)
      .orderBy(asc(rounds.deadline));
  }

  // Circle time: a test clock's frozen time, or real time (like the rest of the circle).
  async function circleNow(testClockId: string | null): Promise<Date> {
    if (!testClockId) return realNow();
    const [clock] = await db.select({ frozenTime: testClocks.frozenTime }).from(testClocks).where(eq(testClocks.id, testClockId));
    return clock?.frozenTime ?? realNow();
  }

  async function audit(tx: Db | Tx, walletId: string, eventType: string, subjectId: string, amount?: bigint): Promise<void> {
    await tx
      .insert(auditEvents)
      .values({ walletId, eventType, externalId: `${eventType}:${subjectId}`, amount: amount ?? null })
      .onConflictDoNothing({ target: auditEvents.externalId });
  }

  // Each attempt is audited on its own (a debt may take several tries).
  const attemptOf = (r: Row) => `${r.contribution.id}:${r.contribution.requestedAt?.getTime() ?? 0}`;

  async function backToOwed(r: Row, code: string): Promise<void> {
    const [owed] = await db
      .update(contributions)
      .set({ status: "FAILED", failureCode: code })
      .where(and(eq(contributions.id, r.contribution.id), eq(contributions.status, "PROCESSING")))
      .returning({ id: contributions.id });
    if (owed) await audit(db, r.poolWalletId, "debt.failed", attemptOf(r));
  }

  // Incoming payment on the pool (once), then the member pays it. Errors are the caller's.
  async function send(r: Row, recovering: boolean): Promise<void> {
    const c = r.contribution;
    let incomingPaymentUrl = c.incomingPaymentUrl;
    if (!incomingPaymentUrl) {
      ({ url: incomingPaymentUrl } = await payments.createIncomingPayment({
        amount: { value: c.value.toString(), assetCode: c.assetCode, assetScale: c.assetScale },
        key: keyOf(c.id),
        expiresAt: new Date(realNow().getTime() + INCOMING_TTL_MS),
      }));
      await db.update(contributions).set({ incomingPaymentUrl }).where(eq(contributions.id, c.id));
    }
    const receiver = incomingPaymentUrl;
    const sent = await memberAccess.withAccess(r.userId, async (access) => {
      // A previous run may have paid and died before saving it: never charge twice.
      const earlier = recovering ? await payments.findMemberPayment(access, keyOf(c.id)) : null;
      return earlier ?? payments.payFromMember(access, { incomingPaymentUrl: receiver, key: keyOf(c.id) });
    });
    await db
      .update(contributions)
      .set({ outgoingPaymentUrl: sent.outgoingPaymentUrl, ...("quoteUrl" in sent ? { quoteUrl: sent.quoteUrl } : {}) })
      .where(eq(contributions.id, c.id));
  }

  /** Reads the pool's incoming payment; once it holds the amount, completes the debt. */
  async function settle(r: Row): Promise<boolean> {
    const [fresh] = await db.select({ url: contributions.incomingPaymentUrl }).from(contributions).where(eq(contributions.id, r.contribution.id));
    if (!fresh?.url) return false;
    const { received } = await payments.readIncomingPayment(fresh.url);
    if (received < r.contribution.value) return false;
    const now = await circleNow(r.testClockId);

    await db.transaction(async (tx) => {
      const [done] = await tx
        .update(contributions)
        .set({ status: "COMPLETED", completedAt: now, failureCode: null })
        .where(and(eq(contributions.id, r.contribution.id), eq(contributions.status, "PROCESSING")))
        .returning({ id: contributions.id });
      if (!done) return;
      await audit(tx, r.poolWalletId, "contribution.completed", r.contribution.id, r.contribution.value);
      // The round's beneficiary received this much less: it goes to them now, after the fee.
      if (r.beneficiaryMemberId === null || r.beneficiaryMemberId === r.contribution.memberId) return;
      const { net, fee } = afterFee(r.contribution.value, r.feeBps);
      if (net <= 0n) return;
      const key = `payout:compensation:${r.contribution.id}`;
      const [created] = await tx
        .insert(payouts)
        .values({
          circleId: r.circleId,
          roundId: r.contribution.roundId,
          memberId: r.beneficiaryMemberId,
          kind: "COMPENSATION",
          value: net,
          assetCode: r.contribution.assetCode,
          assetScale: r.contribution.assetScale,
          idempotencyKey: key,
        })
        .onConflictDoNothing({ target: payouts.idempotencyKey })
        .returning({ id: payouts.id });
      if (!created) return;
      await audit(tx, r.poolWalletId, "payout.created", key, net);
      if (fee > 0n) await audit(tx, r.poolWalletId, "payout.fee", key, fee);
    });
    return true;
  }

  const toDto = (r: Row): DebtDto => ({
    contributionId: r.contribution.id,
    circleId: r.circleId,
    circleName: r.circleName,
    roundNumber: r.roundNumber,
    amount: { value: r.contribution.value.toString(), assetCode: r.contribution.assetCode, assetScale: r.contribution.assetScale },
    deadline: r.deadline.toISOString(),
    status: r.contribution.status === "PROCESSING" ? "PAYING" : "OWED",
  });

  return {
    /** What the user owes their circles, and what they are paying right now; oldest first. */
    async list(userId: string): Promise<DebtDto[]> {
      const owed = await debtRows(and(eq(circleMembers.userId, userId), isOpenDebt));
      const paying = await debtRows(and(eq(circleMembers.userId, userId), isDebtInFlight));
      return [...owed, ...paying].sort((a, b) => a.deadline.getTime() - b.deadline.getTime()).map(toDto);
    },

    /**
     * Pays one open debt through the user's wallet grant. Waits a little for the money to arrive;
     * if it hasn't yet, it is PAYING and the next tick finishes it.
     */
    async pay(userId: string, contributionId: string): Promise<DebtDto | null> {
      const [row] = await debtRows(and(eq(contributions.id, contributionId), eq(circleMembers.userId, userId), isOpenDebt));
      if (!row) {
        const [inFlight] = await debtRows(and(eq(contributions.id, contributionId), eq(circleMembers.userId, userId), isDebtInFlight));
        if (inFlight) throw new AppError(409, "DEBT_IN_PROGRESS", "This debt is already being paid");
        throw notFound();
      }
      // Claim it: one payment at a time. A fresh attempt: earlier Open Payments resources are dead.
      const [claimed] = await db
        .update(contributions)
        .set({ status: "PROCESSING", requestedAt: realNow(), failureCode: null, incomingPaymentUrl: null, quoteUrl: null, outgoingPaymentUrl: null })
        .where(and(eq(contributions.id, contributionId), eq(contributions.status, "FAILED")))
        .returning();
      if (!claimed) throw new AppError(409, "DEBT_IN_PROGRESS", "This debt is already being paid");
      const r: Row = { ...row, contribution: claimed };
      await audit(db, r.poolWalletId, "debt.processing", attemptOf(r));

      try {
        await send(r, false);
      } catch (err) {
        if (err instanceof NoGrantError) {
          await backToOwed(r, "NO_GRANT");
          throw new AppError(409, "WALLET_NOT_AUTHORIZED", "Link your wallet again to pay");
        }
        if (err instanceof PaymentRefusedError) {
          await backToOwed(r, err.step === "quote" ? "QUOTE_FAILED" : "PAYMENT_REFUSED");
          throw new AppError(422, "PAYMENT_REFUSED", "Your wallet refused the payment");
        }
        // Transient: stays PAYING; the tick recovers it after the lease.
        console.error("Debt payment failed", r.contribution.id, err instanceof Error ? err.name : "unknown");
        return toDto(r);
      }
      for (let i = 0; i < settleWait.attempts; i++) {
        if (await settle(r).catch(() => false)) return null;
        await sleep(settleWait.intervalMs);
      }
      return toDto(r);
    },

    /** In the circle cycle: finishes debt payments of this circle still on their way. */
    async syncCircle(circleId: string): Promise<void> {
      const inFlight = await debtRows(and(eq(circles.id, circleId), isDebtInFlight));
      for (const r of inFlight) {
        const c = r.contribution;
        if (c.outgoingPaymentUrl) {
          await settle(r).catch(() => console.error("Debt payment read failed", c.id));
          continue;
        }
        // Lost between the claim and the payment: recover after the lease, renewing it first.
        if (!c.requestedAt || c.requestedAt.getTime() > realNow().getTime() - LEASE_MS) continue;
        const [leased] = await db
          .update(contributions)
          .set({ requestedAt: realNow() })
          .where(and(eq(contributions.id, c.id), eq(contributions.requestedAt, c.requestedAt), isNull(contributions.outgoingPaymentUrl)))
          .returning();
        if (!leased) continue;
        try {
          await send({ ...r, contribution: leased }, true);
          await settle(r);
        } catch (err) {
          if (err instanceof NoGrantError) await backToOwed(r, "NO_GRANT");
          else if (err instanceof PaymentRefusedError) await backToOwed(r, err.step === "quote" ? "QUOTE_FAILED" : "PAYMENT_REFUSED");
          else console.error("Debt payment recovery failed", c.id, err instanceof Error ? err.name : "unknown");
        }
      }
    },
  };
}

export type DebtService = ReturnType<typeof createDebtService>;
