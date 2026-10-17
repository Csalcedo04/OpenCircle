import { describe, expect, it } from "vitest"
import type { ApplicationDto, CircleDto, MemberDto } from "@/lib/api/backend"
import { CADENCE_DAYS, contributionStatus, membersOf, toCircle, toCircleApplication, toMember, toReview } from "./from-api"

const COP = { assetCode: "COP", assetScale: 2 }
const record = (onTime: number) => ({
  payments: { onTime, late: 0, missed: 0 },
  ratings: { count: 1, tenths: 45 },
  circlesCompleted: 2,
  memberSince: "2026-01-02T00:00:00.000Z",
})
const review = {
  id: "00000000-0000-4000-8000-000000000011",
  authorId: "00000000-0000-4000-8000-0000000000aa",
  authorName: "Ana G.",
  subjectId: "00000000-0000-4000-8000-0000000000bb",
  circleId: "00000000-0000-4000-8000-0000000000cc",
  circleName: "Natillera",
  rating: 4,
  comment: null,
  createdAt: "2026-02-01T00:00:00.000Z",
}

const dto: CircleDto = {
  id: "c",
  name: "Natillera",
  city: "Medellín",
  status: "ACTIVE",
  contribution: { value: "2000000", ...COP },
  size: 2,
  seatsTaken: 2,
  cadence: "MONTHLY",
  createdAt: "2026-01-01T00:00:00.000Z",
  feeBps: 200,
  threshold: { value: "2000000", ...COP },
  grantWeightBps: 5000,
  approvalMode: "DELEGATES",
  poolWalletAddress: "https://ilp.interledger-test.dev/opencircle",
  startedAt: "2026-01-03T00:00:00.000Z",
  currentRound: 1,
  seats: [
    { memberId: "seat-a", userId: "user-a", displayName: "Ana G.", payoutRound: 1, collateral: { value: "0", ...COP }, grantMode: "RECURRING", record: record(3) },
    { memberId: "seat-b", userId: "user-b", displayName: "Bob R.", payoutRound: 2, collateral: { value: "500000", ...COP }, grantMode: null, record: record(1) },
  ],
  rounds: [
    {
      number: 1,
      state: "COLLECTING",
      beneficiaryMemberId: "seat-a",
      startsAt: "2026-01-03T00:00:00.000Z",
      deadline: "2026-02-03T00:00:00.000Z",
      contributions: [
        { memberId: "seat-a", status: "COMPLETED" },
        { memberId: "seat-b", status: "PROCESSING" },
      ],
    },
  ],
  reviews: [review],
  visibility: "PRIVATE",
  inviteUrl: null,
}

describe("toCircle", () => {
  it("keys seats, beneficiaries and contributions by member (user), not by seat", () => {
    const c = toCircle(dto)
    expect(c.seats.map((s) => s.memberId)).toEqual(["user-a", "user-b"])
    expect(c.rounds[0]?.beneficiaryId).toBe("user-a")
    expect(c.rounds[0]?.contributions).toEqual([
      { memberId: "user-a", status: "VERIFIED" },
      { memberId: "user-b", status: "PENDING" },
    ])
  })

  it("maps money, cadence and the current round", () => {
    const c = toCircle(dto)
    expect(c.contribution).toEqual({ value: "2000000", ...COP })
    expect(c.thresholdValue).toBe("2000000")
    expect(c.seats[1]?.collateralValue).toBe("500000")
    expect(c.seats[1]?.grant).toBeNull()
    expect(c.roundLengthDays).toBe(CADENCE_DAYS.MONTHLY)
    expect(c.currentRound).toBe(1)
    expect(toCircle({ ...dto, currentRound: null }).currentRound).toBe(0)
  })
})

describe("contributionStatus", () => {
  it("only completed payments count as verified", () => {
    expect(contributionStatus("COMPLETED")).toBe("VERIFIED")
    expect(contributionStatus("FAILED")).toBe("MISSING")
    expect(contributionStatus("CANCELLED")).toBe("REFUNDED")
    expect(contributionStatus("PENDING")).toBe("PENDING")
    expect(contributionStatus("PROCESSING")).toBe("PENDING")
    expect(contributionStatus("SOMETHING_NEW")).toBe("PENDING")
  })
})

describe("members and reviews", () => {
  it("builds members from seats, with their record and ratings", () => {
    const [ana] = membersOf(dto)
    expect(ana).toEqual({
      id: "user-a",
      name: "Ana G.",
      walletAddress: null,
      memberSince: "2026-01-02T00:00:00.000Z",
      payments: { onTime: 3, late: 0, missed: 0 },
      ratings: { count: 1, tenths: 45 },
      circlesCompleted: 2,
    })
  })

  it("keeps the profile's wallet", () => {
    const m: MemberDto = { ...record(0), id: "user-a", displayName: "Ana G.", walletAddress: "https://w/a", reviews: [], circles: [] }
    expect(toMember(m).walletAddress).toBe("https://w/a")
  })

  it("reviews carry author and circle names; a missing comment is empty", () => {
    expect(toReview(review)).toMatchObject({ authorName: "Ana G.", circleName: "Natillera", rating: 4, comment: "", date: review.createdAt })
  })

  it("maps application DTO to domain CircleApplication", () => {
    const appDto: ApplicationDto = {
      id: "00000000-0000-4000-8000-000000000099",
      status: "PENDING",
      applicant: {
        id: "00000000-0000-4000-8000-0000000000aa",
        displayName: "Carlos S.",
        walletAddress: "https://ilp.rafiki.money/carlos",
        ics: 88,
      },
      votes: { accept: 1, reject: 0 },
      createdAt: "2026-03-01T00:00:00.000Z",
      decidedAt: null,
    }
    const domain = toCircleApplication(appDto)
    expect(domain).toEqual({
      id: "00000000-0000-4000-8000-000000000099",
      status: "PENDING",
      applicant: {
        id: "00000000-0000-4000-8000-0000000000aa",
        name: "Carlos S.",
        walletAddress: "https://ilp.rafiki.money/carlos",
        ics: 88,
      },
      votes: { accept: 1, reject: 0 },
      createdAt: "2026-03-01T00:00:00.000Z",
      decidedAt: null,
    })
  })
})
