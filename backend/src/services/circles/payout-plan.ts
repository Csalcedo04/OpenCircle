import type { CONTRIBUTION_STATUSES, PAYOUT_KINDS } from "../../db/schema";
import { roundsTotal, type CircleTerms, type PayoutMode } from "./circle-plan";

type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

export interface PlanContribution {
  id: string;
  memberId: string;
  value: bigint;
  status: ContributionStatus;
}

export interface PlanRound {
  id: string;
  number: number;
  beneficiaryMemberId: string | null;
  contributions: PlanContribution[];
}

/** One payout to create. `value` is what leaves the pot; `fee` is OpenCircle's cut, kept in it. */
export interface PlannedPayout {
  key: string;
  kind: PayoutKind;
  roundId: string | null;
  memberId: string;
  value: bigint;
  fee: bigint;
}

const BPS = 10_000n;

/** OpenCircle's fee on a payout, rounded down; the residue stays in the pot. */
export function afterFee(gross: bigint, feeBps: number): { net: bigint; fee: bigint } {
  const fee = (gross * BigInt(feeBps)) / BPS;
  return { net: gross - fee, fee };
}

const paid = (contributions: PlanContribution[], memberId?: string) =>
  contributions.filter((c) => c.status === "COMPLETED" && (memberId === undefined || c.memberId === memberId)).reduce((sum, c) => sum + c.value, 0n);

// Zero-value payouts are never created (nothing to send).
function payout(p: Omit<PlannedPayout, "value" | "fee">, gross: bigint, feeBps: number): PlannedPayout[] {
  const { net, fee } = afterFee(gross, feeBps);
  return net > 0n ? [{ ...p, value: net, fee }] : [];
}

/**
 * PER_ROUND: what paying out `round` creates. Its beneficiary gets what the round collected,
 * less what they failed to pay into earlier rounds of other beneficiaries; that netted debt goes
 * to those beneficiaries as compensation, oldest first, for as far as the pot covers it.
 * A miss in their own round needs no netting: their own pot is just smaller.
 */
export function planRoundPayouts(round: PlanRound, earlier: readonly PlanRound[], feeBps: number): PlannedPayout[] {
  const beneficiary = round.beneficiaryMemberId;
  if (beneficiary === null) return [];
  const gross = paid(round.contributions);

  const debts = [...earlier]
    .filter((r) => r.number < round.number && r.beneficiaryMemberId !== null && r.beneficiaryMemberId !== beneficiary)
    .sort((a, b) => a.number - b.number)
    .flatMap((r) =>
      r.contributions
        .filter((c) => c.memberId === beneficiary && c.status === "FAILED")
        .map((c) => ({ contributionId: c.id, roundId: r.id, to: r.beneficiaryMemberId as string, value: c.value })),
    );

  let left = gross;
  const compensations = debts.flatMap((d) => {
    const amount = d.value < left ? d.value : left;
    left -= amount;
    return payout({ key: `payout:compensation:${d.contributionId}`, kind: "COMPENSATION", roundId: d.roundId, memberId: d.to }, amount, feeBps);
  });

  return [...payout({ key: `payout:round:${round.id}`, kind: "ROUND", roundId: round.id, memberId: beneficiary }, left, feeBps), ...compensations];
}

/**
 * What each member receives if everyone pays, after the fee: PER_ROUND their round's pot
 * (contribution × members), END what they put in over every round (contribution × rounds).
 * Both are contribution × roundsTotal, since a PER_ROUND circle has one round per member.
 */
export function payoutPerMember(c: CircleTerms & { feeBps: number }): bigint {
  return afterFee(c.contributionValue * BigInt(roundsTotal(c)), c.feeBps).net;
}

/**
 * Each member's total payout (round or final, plus compensations) of a started circle if
 * everyone pays from now on: contributions not settled yet count as paid, and rounds not
 * opened yet as fully paid; missed ones stay missed. The same planner as the real payouts.
 */
export function expectedPayouts(input: {
  circleId: string;
  payoutMode: PayoutMode;
  feeBps: number;
  contributionValue: bigint;
  memberIds: readonly string[];
  rounds: readonly PlanRound[];
}): Map<string, bigint> {
  const projected: PlanRound[] = input.rounds.map((r) => ({
    ...r,
    contributions:
      r.contributions.length === 0
        ? input.memberIds.map((memberId) => ({ id: `projected:${r.id}:${memberId}`, memberId, value: input.contributionValue, status: "COMPLETED" }))
        : r.contributions.map((c) => (c.status === "PENDING" || c.status === "PROCESSING" ? { ...c, status: "COMPLETED" } : c)),
  }));
  const planned =
    input.payoutMode === "END"
      ? planFinalPayouts(input.circleId, input.memberIds, projected, input.feeBps)
      : projected.flatMap((r) => planRoundPayouts(r, projected, input.feeBps));
  const totals = new Map(input.memberIds.map((id) => [id, 0n]));
  for (const p of planned) totals.set(p.memberId, (totals.get(p.memberId) ?? 0n) + p.value);
  return totals;
}

/** END: once every round has closed, each member gets back what they paid in, after the fee. */
export function planFinalPayouts(circleId: string, memberIds: readonly string[], rounds: readonly PlanRound[], feeBps: number): PlannedPayout[] {
  const all = rounds.flatMap((r) => r.contributions);
  return memberIds.flatMap((memberId) =>
    payout({ key: `payout:final:${circleId}:${memberId}`, kind: "FINAL", roundId: null, memberId }, paid(all, memberId), feeBps),
  );
}
