import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Every table enables RLS with no policies: the Supabase Data API (anon/authenticated)
// gets no access, while the backend connects as the table owner and is unaffected.

// Open Payments wallet address. Its asset (code + scale) is the unit of every amount
// stored in the tables keyed by `wallet_id`.
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressUrl: text("address_url").notNull().unique(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("wallets_asset_scale_range", sql`${t.assetScale} between 0 and 255`)],
).enableRLS();

// cc: cédula de ciudadanía, ti: tarjeta de identidad, ce: cédula de extranjería, pp: pasaporte.
export const documentType = pgEnum("document_type", ["cc", "ti", "ce", "pp"]);

// `id` is the Supabase Auth user id (auth.users.id), so it has no default. Deleting the Auth
// user deletes this row (trigger on auth.users, migration 0009), and deleting this row cascades
// to the user's consent, grants, KYC, applications and reviews. It never cascades into circles:
// deleting a user who created a circle or holds a seat fails. The wallet and its audit history stay.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique(),
    documentType: documentType("document_type").notNull(),
    documentNumber: text("document_number").notNull(),
    // ISO 3166-1 alpha-2 country code, e.g. "CO".
    nationality: varchar("nationality", { length: 2 }).notNull(),
    fullName: text("full_name"),
    phone: varchar("phone", { length: 256 }),
    dob: date("dob"),
    opWallet: uuid("op_wallet")
      .unique()
      .references(() => wallets.id),
  },
  (t) => [unique("users_document_unique").on(t.documentType, t.documentNumber)],
).enableRLS();

// Amounts are integers in the wallet asset's minor unit (see wallets.asset_scale).
export const walletBalances = pgTable(
  "wallet_balances",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id, { onDelete: "cascade" }),
    balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("wallet_balances_balance_non_negative", sql`${t.balance} >= 0`)],
).enableRLS();

export const creditProfiles = pgTable(
  "credit_profiles",
  {
    walletId: uuid("wallet_id")
      .primaryKey()
      .references(() => wallets.id, { onDelete: "cascade" }),
    // Payment-reliability fraction, 0..1 with 4 decimals; read as a JS number. The ICS is this × 100.
    internalCreditScore: numeric("internal_credit_score", { precision: 5, scale: 4, mode: "number" }).notNull(),
    // Maximum debt the user may take, in the wallet asset's minor unit.
    borrowingCapacity: bigint("borrowing_capacity", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("credit_profiles_score_range", sql`${t.internalCreditScore} between 0 and 1`),
    check("credit_profiles_borrowing_capacity_non_negative", sql`${t.borrowingCapacity} >= 0`),
  ],
).enableRLS();

// Append-only log of state changes. Never store PII, tokens, keys or raw webhook payloads here.
// Every event belongs to a wallet (external) or an internal ledger account, or both.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No cascade: deleting a wallet must not erase its audit history.
    walletId: uuid("wallet_id").references(() => wallets.id),
    // Internal ledger account (see ledger_accounts); no cascade either.
    accountId: uuid("account_id").references((): AnyPgColumn => ledgerAccounts.id),
    eventType: text("event_type").notNull(),
    // Source event id (e.g. Rafiki webhook id); unique so a retried event is applied once.
    externalId: text("external_id").unique(),
    // Signed delta in the asset's minor unit; null for events that move no funds.
    amount: bigint("amount", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_wallet_id_created_at_idx").on(t.walletId, t.createdAt),
    index("audit_events_account_id_created_at_idx").on(t.accountId, t.createdAt),
    check("audit_events_subject", sql`${t.walletId} is not null or ${t.accountId} is not null`),
  ],
).enableRLS();

// One interactive GNAP grant request in flight. `state` ties the wallet's redirect back
// to this row; client nonce + finish nonce + grant endpoint verify the redirect `hash`.
// Single use, short expiry.
export const consentChallenges = pgTable(
  "consent_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state").notNull().unique(),
    walletAddressUrl: text("wallet_address_url").notNull(),
    grantEndpoint: text("grant_endpoint").notNull(),
    clientNonce: text("client_nonce").notNull(),
    finishNonce: text("finish_nonce").notNull(),
    continueUri: text("continue_uri").notNull(),
    // Encrypted with GRANT_TOKEN_KEY.
    continueTokenCiphertext: text("continue_token_ciphertext").notNull(),
    status: text("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consent_challenges_user_id_idx").on(t.userId),
    check("consent_challenges_status", sql`${t.status} in ('PENDING', 'COMPLETED', 'CANCELLED')`),
  ],
).enableRLS();

// Standing outgoing-payment + quote grant a user gave OpenCircle on their wallet.
export const walletGrants = pgTable(
  "wallet_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    // Encrypted with GRANT_TOKEN_KEY.
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    // Token management URI: rotate or revoke the access token.
    manageUri: text("manage_uri").notNull(),
    // Grant continuation URI: cancel the whole grant.
    continueUri: text("continue_uri").notNull(),
    // Null when the authorization server gave no expiry.
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("wallet_grants_user_id_idx").on(t.userId),
    check("wallet_grants_status", sql`${t.status} in ('ACTIVE', 'REVOKED')`),
  ],
).enableRLS();

// One Didit KYC session per row. Only the status is kept: Didit's decision carries
// names, document data and images, which never leave Didit.
export const kycVerifications = pgTable(
  "kyc_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().unique(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("kyc_verifications_user_id_created_at_idx").on(t.userId, t.createdAt)],
).enableRLS();

// ── Savings circles (natilleras) ─────────────────────────────────────────────
// Pool model: every member pays the contribution into the circle's pot each round,
// and one member (the round's beneficiary) receives the pot. Amounts are integers in
// the minor unit of the circle's asset. No cascades from circles or seats: a circle's history
// is never erased. Only a user's own applications and reviews go with the user.

export const CIRCLE_STATUSES = ["OPEN", "ACTIVE", "COMPLETED"] as const;
export const GRANT_MODES = ["RECURRING", "PER_ROUND"] as const;
// Where a seat's contributions come from: the member's OpenCircle ledger account, or their own
// Open Payments wallet through a GNAP grant.
export const FUNDING_SOURCES = ["INTERNAL_ACCOUNT", "EXTERNAL_WALLET"] as const;
// A period is one or two calendar weeks, or one calendar month; a circle has one period per member.
export const CIRCLE_CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
// Who receives the pot first, by reliability score (ICS). Set by the creator; joining means agreeing.
export const PAYOUT_ORDERS = ["BEST_SCORE_FIRST", "BEST_SCORE_LAST"] as const;
// PRIVATE: only members and holders of the invite link can see or join. PUBLIC: listed for everyone.
export const CIRCLE_VISIBILITIES = ["PRIVATE", "PUBLIC"] as const;
// UPCOMING: scheduled but not open yet. The rest follow the round engine.
export const ROUND_STATES = [
  "UPCOMING",
  "COLLECTING",
  "FUNDED",
  "RISK_CHECK",
  "BLOCKED",
  "PAYING_OUT",
  "PAID_OUT",
  "REFUNDED",
] as const;
// The project's payment state machine; COMPLETED only with verifiable proof (signed webhook).
export const CONTRIBUTION_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
// DELEGATES: the creator and the members they delegate decide; the first decision wins.
// MAJORITY: more than half of the members must accept.
export const APPROVAL_MODES = ["DELEGATES", "MAJORITY"] as const;
export const APPLICATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
export const VOTE_DECISIONS = ["ACCEPT", "REJECT"] as const;
// PER_ROUND: classic rotation, each round's pot goes to that round's beneficiary.
// END: the pot is held until the last round (the goal); then each member gets what they paid in.
export const PAYOUT_MODES = ["PER_ROUND", "END"] as const;
// ROUND: a round's pot to its beneficiary. FINAL: an END circle's member gets their contributions.
// COMPENSATION: a defaulter's netted debt, to the beneficiary who received less because of it.
export const PAYOUT_KINDS = ["ROUND", "FINAL", "COMPENSATION"] as const;
export const PAYOUT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// Dev-only simulated time (TEST_CLOCKS_ENABLED). A circle attached to a clock reads its time
// from `frozenTime` instead of the real clock; advancing it runs the period engine.
export const testClocks = pgTable(
  "test_clocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    frozenTime: timestamp("frozen_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("test_clocks_owner_user_id_idx").on(t.ownerUserId),
    check("test_clocks_name_length", sql`char_length(${t.name}) between 1 and 80`),
  ],
).enableRLS();

export const circles = pgTable(
  "circles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Optional: the create form no longer asks for it; older circles keep theirs.
    city: text("city"),
    status: text("status").$type<(typeof CIRCLE_STATUSES)[number]>().notNull().default("OPEN"),
    // What each member pays per round.
    contributionValue: bigint("contribution_value", { mode: "bigint" }).notNull(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    // OpenCircle's fee on each pot, in basis points.
    feeBps: integer("fee_bps").notNull().default(0),
    // Max uncovered exposure before the round engine blocks a payout.
    thresholdValue: bigint("threshold_value", { mode: "bigint" }).notNull().default(sql`0`),
    // Weight of an active recurring grant as coverage of a member's debt, in basis points.
    grantWeightBps: integer("grant_weight_bps").notNull().default(5000),
    // Legacy: new circles derive it from the cadence (7 or 30). Periods come from `cadence`.
    roundLengthDays: integer("round_length_days").notNull(),
    cadence: text("cadence").$type<(typeof CIRCLE_CADENCES)[number]>().notNull().default("MONTHLY"),
    visibility: text("visibility").$type<(typeof CIRCLE_VISIBILITIES)[number]>().notNull().default("PRIVATE"),
    // Seats are reordered by score when the circle fills; until then a seat's round is provisional.
    payoutOrder: text("payout_order").$type<(typeof PAYOUT_ORDERS)[number]>().notNull().default("BEST_SCORE_FIRST"),
    // Legacy: superseded by `circle_invites` (migration 0011). Never read or written anymore.
    inviteCode: text("invite_code").unique(),
    // Number of seats; also of rounds when payout_mode is PER_ROUND.
    size: integer("size").notNull(),
    payoutMode: text("payout_mode").$type<(typeof PAYOUT_MODES)[number]>().notNull().default("PER_ROUND"),
    // END circles only: what the pot collects in total. Rounds = goal / (contribution × size).
    goalValue: bigint("goal_value", { mode: "bigint" }),
    // The pot. For now every circle uses OpenCircle's own wallet; pots are told apart in the DB.
    poolWalletId: uuid("pool_wallet_id")
      .notNull()
      .references(() => wallets.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    // Set only at creation, and only while test clocks are enabled.
    testClockId: uuid("test_clock_id").references(() => testClocks.id),
    // Who accepts applicants; chosen by the creator.
    approvalMode: text("approval_mode").$type<(typeof APPROVAL_MODES)[number]>().notNull().default("DELEGATES"),
    // Set when the circle fills and its rounds are scheduled.
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("circles_status_idx").on(t.status),
    index("circles_created_by_idx").on(t.createdBy),
    check("circles_status", sql`${t.status} in (${inList(CIRCLE_STATUSES)})`),
    check("circles_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("circles_contribution_positive", sql`${t.contributionValue} > 0`),
    check("circles_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
    check("circles_fee_bps_range", sql`${t.feeBps} between 0 and 10000`),
    check("circles_threshold_non_negative", sql`${t.thresholdValue} >= 0`),
    check("circles_grant_weight_bps_range", sql`${t.grantWeightBps} between 0 and 10000`),
    check("circles_round_length_range", sql`${t.roundLengthDays} between 1 and 365`),
    check("circles_size_range", sql`${t.size} between 2 and 50`),
    check("circles_cadence", sql`${t.cadence} in (${inList(CIRCLE_CADENCES)})`),
    check("circles_visibility", sql`${t.visibility} in (${inList(CIRCLE_VISIBILITIES)})`),
    check("circles_payout_order", sql`${t.payoutOrder} in (${inList(PAYOUT_ORDERS)})`),
    check("circles_approval_mode", sql`${t.approvalMode} in (${inList(APPROVAL_MODES)})`),
    check("circles_payout_mode", sql`${t.payoutMode} in (${inList(PAYOUT_MODES)})`),
    check("circles_goal_only_end", sql`(${t.payoutMode} = 'END') = (${t.goalValue} is not null)`),
    // The goal splits into a whole number of rounds of contributions.
    check(
      "circles_goal_divisible",
      sql`${t.goalValue} is null or (${t.goalValue} > 0 and ${t.goalValue} % (${t.contributionValue} * ${t.size}) = 0)`,
    ),
    index("circles_test_clock_id_idx").on(t.testClockId),
  ],
).enableRLS();

// A seat: one member of one circle, with the round in which they receive the pot.
export const circleMembers = pgTable(
  "circle_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    // 1-based; at most the circle's size (checked by the service, the DB can't see circles.size here).
    // Provisional (join order) while the circle is OPEN; set from the payout order when it starts.
    // In END circles nobody is paid per round: it is only the seat's order.
    payoutRound: integer("payout_round").notNull(),
    // Held in the pot as coverage for debt after the member's own payout.
    collateralValue: bigint("collateral_value", { mode: "bigint" }).notNull().default(sql`0`),
    // How the member authorized contributions; null until they choose. Only meaningful for EXTERNAL_WALLET seats.
    grantMode: text("grant_mode").$type<(typeof GRANT_MODES)[number]>(),
    // Seats that existed before internal accounts were all paid from the member's own wallet.
    fundingSource: text("funding_source").$type<(typeof FUNDING_SOURCES)[number]>().notNull().default("EXTERNAL_WALLET"),
    // May accept or reject applicants when the circle uses DELEGATES. The creator always can.
    isApprover: boolean("is_approver").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("circle_members_circle_user_unique").on(t.circleId, t.userId),
    unique("circle_members_circle_payout_round_unique").on(t.circleId, t.payoutRound),
    index("circle_members_user_id_idx").on(t.userId),
    check("circle_members_payout_round_positive", sql`${t.payoutRound} >= 1`),
    check("circle_members_collateral_non_negative", sql`${t.collateralValue} >= 0`),
    check("circle_members_grant_mode", sql`${t.grantMode} is null or ${t.grantMode} in (${inList(GRANT_MODES)})`),
    check("circle_members_funding_source", sql`${t.fundingSource} in (${inList(FUNDING_SOURCES)})`),
  ],
).enableRLS();

// A request to take a seat in an OPEN circle, decided by the circle's approvers or majority.
export const circleApplications = pgTable(
  "circle_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Seat preferences, copied to circle_members on acceptance. Null payout round: next free one.
    payoutRound: integer("payout_round"),
    collateralValue: bigint("collateral_value", { mode: "bigint" }).notNull().default(sql`0`),
    grantMode: text("grant_mode").$type<(typeof GRANT_MODES)[number]>(),
    status: text("status").$type<(typeof APPLICATION_STATUSES)[number]>().notNull().default("PENDING"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open application per user and circle; decided ones stay as history.
    uniqueIndex("circle_applications_pending_unique")
      .on(t.circleId, t.userId)
      .where(sql`${t.status} = 'PENDING'`),
    index("circle_applications_user_id_idx").on(t.userId),
    check("circle_applications_status", sql`${t.status} in (${inList(APPLICATION_STATUSES)})`),
    check("circle_applications_payout_round_positive", sql`${t.payoutRound} is null or ${t.payoutRound} >= 1`),
    check("circle_applications_collateral_non_negative", sql`${t.collateralValue} >= 0`),
    check(
      "circle_applications_grant_mode",
      sql`${t.grantMode} is null or ${t.grantMode} in (${inList(GRANT_MODES)})`,
    ),
    check("circle_applications_decided_at", sql`(${t.status} = 'PENDING') = (${t.decidedAt} is null)`),
  ],
).enableRLS();

// One member's decision on one application.
export const applicationVotes = pgTable(
  "application_votes",
  {
    applicationId: uuid("application_id")
      .notNull()
      .references(() => circleApplications.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => circleMembers.id),
    decision: text("decision").$type<(typeof VOTE_DECISIONS)[number]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "application_votes_pkey", columns: [t.applicationId, t.memberId] }),
    check("application_votes_decision", sql`${t.decision} in (${inList(VOTE_DECISIONS)})`),
  ],
).enableRLS();

// ── Friends and circle invitations ───────────────────────────────────────────

export const FRIENDSHIP_STATUSES = ["PENDING", "ACCEPTED"] as const;
export const INVITE_KINDS = ["CODE", "DIRECT"] as const;
// Stored states. Whether an ACTIVE invite is still usable (not expired, uses left) is derived on read.
export const INVITE_STATUSES = ["ACTIVE", "ACCEPTED", "REVOKED"] as const;

// One row per pair of users: the request (PENDING) becomes the friendship (ACCEPTED). Rejecting,
// withdrawing or removing deletes the row, so there is no history. Goes with either user.
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<(typeof FRIENDSHIP_STATUSES)[number]>().notNull().default("PENDING"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The pair is unordered: A→B and B→A are the same relationship.
    uniqueIndex("friendships_pair_unique").on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`),
    index("friendships_addressee_id_idx").on(t.addresseeId),
    check("friendships_status", sql`${t.status} in (${inList(FRIENDSHIP_STATUSES)})`),
    check("friendships_not_self", sql`${t.requesterId} <> ${t.addresseeId}`),
    check("friendships_accepted_at", sql`(${t.status} = 'ACCEPTED') = (${t.acceptedAt} is not null)`),
  ],
).enableRLS();

// A way into an OPEN circle, made by its creator or an approver. CODE: a shareable link, optionally
// expiring or limited to `max_uses` joins. DIRECT: for one person (a user, or an email that may not
// have an account yet), single use. `token` is the secret in the link: compared in constant time,
// never looked up by equality. No cascade from the circle: a circle's history is never erased.
export const circleInvites = pgTable(
  "circle_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    kind: text("kind").$type<(typeof INVITE_KINDS)[number]>().notNull(),
    token: text("token").notNull().unique(),
    status: text("status").$type<(typeof INVITE_STATUSES)[number]>().notNull().default("ACTIVE"),
    // Inviters hold a seat, so they can't be deleted while the circle exists.
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    // DIRECT: the invitee, once known. Set at creation for an existing user, or when the email's owner joins.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    // DIRECT by email: lowercase, as users.email. Shown only to the circle's approvers.
    email: text("email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // CODE only; null is unlimited.
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    // DIRECT: the seat the invite produced.
    acceptedMemberId: uuid("accepted_member_id").references(() => circleMembers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("circle_invites_circle_id_idx").on(t.circleId),
    index("circle_invites_user_id_idx").on(t.userId),
    index("circle_invites_email_idx").on(t.email).where(sql`${t.email} is not null`),
    check("circle_invites_kind", sql`${t.kind} in (${inList(INVITE_KINDS)})`),
    check("circle_invites_status", sql`${t.status} in (${inList(INVITE_STATUSES)})`),
    check("circle_invites_direct_target", sql`(${t.kind} = 'DIRECT') = (${t.userId} is not null or ${t.email} is not null)`),
    check("circle_invites_max_uses", sql`${t.maxUses} is null or (${t.kind} = 'CODE' and ${t.maxUses} >= 1)`),
    check("circle_invites_uses_non_negative", sql`${t.uses} >= 0`),
    check("circle_invites_accepted", sql`(${t.status} = 'ACCEPTED') = (${t.acceptedMemberId} is not null)`),
    check("circle_invites_accepted_direct", sql`${t.acceptedMemberId} is null or ${t.kind} = 'DIRECT'`),
    check("circle_invites_email_lower", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
  ],
).enableRLS();

// All rounds are created when the circle starts: round 1 COLLECTING, the rest UPCOMING.
export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    number: integer("number").notNull(),
    // Must be a seat of the same circle (checked by the service). Null in END circles: nobody
    // receives a round's pot, it is held until the end.
    beneficiaryMemberId: uuid("beneficiary_member_id").references(() => circleMembers.id),
    state: text("state").$type<(typeof ROUND_STATES)[number]>().notNull().default("UPCOMING"),
    // The period runs from `startsAt` to `deadline`.
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("rounds_circle_number_unique").on(t.circleId, t.number),
    // Each member receives the pot exactly once per circle (NULLs, END rounds, don't collide).
    unique("rounds_circle_beneficiary_unique").on(t.circleId, t.beneficiaryMemberId),
    check("rounds_number_positive", sql`${t.number} >= 1`),
    check("rounds_state", sql`${t.state} in (${inList(ROUND_STATES)})`),
  ],
).enableRLS();

// One member's payment into one round's pot. The amount is copied from the circle so
// history stays exact if circle settings ever change.
export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id),
    // Must be a seat of the round's circle (checked by the service).
    memberId: uuid("member_id")
      .notNull()
      .references(() => circleMembers.id),
    value: bigint("value", { mode: "bigint" }).notNull(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    status: text("status").$type<(typeof CONTRIBUTION_STATUSES)[number]>().notNull().default("PENDING"),
    // Sent with every Open Payments call for this contribution, so a retry never charges twice.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    // Open Payments resources, saved as soon as each exists so a retry resumes instead of paying twice.
    incomingPaymentUrl: text("incoming_payment_url"),
    quoteUrl: text("quote_url"),
    outgoingPaymentUrl: text("outgoing_payment_url"),
    // Set when the payment request starts (PENDING → PROCESSING).
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    // Why a contribution FAILED (NO_GRANT, QUOTE_FAILED, PAYMENT_REFUSED, DEADLINE_MISSED).
    failureCode: text("failure_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("contributions_round_member_unique").on(t.roundId, t.memberId),
    index("contributions_member_id_idx").on(t.memberId),
    check("contributions_value_positive", sql`${t.value} > 0`),
    check("contributions_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
    check("contributions_status", sql`${t.status} in (${inList(CONTRIBUTION_STATUSES)})`),
    check("contributions_completed_at", sql`(${t.status} = 'COMPLETED') = (${t.completedAt} is not null)`),
  ],
).enableRLS();

// Money from the pot to a member. Paid with a fixed-debit quote from the pool wallet: `value` is
// exactly what leaves the pot (circle asset); the receive amount is what the quote says the
// member's wallet gets in its own asset, and the proof of payment is that wallet receiving it.
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    // The round paid out (ROUND) or the round that was short (COMPENSATION); null for FINAL.
    roundId: uuid("round_id").references(() => rounds.id),
    // Who receives it; a seat of the same circle (checked by the service).
    memberId: uuid("member_id")
      .notNull()
      .references(() => circleMembers.id),
    kind: text("kind").$type<(typeof PAYOUT_KINDS)[number]>().notNull(),
    value: bigint("value", { mode: "bigint" }).notNull(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    // Set from the quote, all three together.
    receiveValue: bigint("receive_value", { mode: "bigint" }),
    receiveAssetCode: text("receive_asset_code"),
    receiveAssetScale: integer("receive_asset_scale"),
    status: text("status").$type<(typeof PAYOUT_STATUSES)[number]>().notNull().default("PENDING"),
    // Sent with every Open Payments call for this payout, so a retry never pays twice.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    // Open Payments resources, saved as soon as each exists so a retry resumes instead of paying twice.
    incomingPaymentUrl: text("incoming_payment_url"),
    quoteUrl: text("quote_url"),
    outgoingPaymentUrl: text("outgoing_payment_url"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("payouts_circle_id_idx").on(t.circleId),
    index("payouts_member_id_idx").on(t.memberId),
    check("payouts_kind", sql`${t.kind} in (${inList(PAYOUT_KINDS)})`),
    check("payouts_round_only_final_null", sql`(${t.kind} = 'FINAL') = (${t.roundId} is null)`),
    check("payouts_value_positive", sql`${t.value} > 0`),
    check("payouts_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
    check(
      "payouts_receive_amount",
      sql`(${t.receiveValue} is null) = (${t.receiveAssetCode} is null) and (${t.receiveValue} is null) = (${t.receiveAssetScale} is null)`,
    ),
    check("payouts_status", sql`${t.status} in (${inList(PAYOUT_STATUSES)})`),
    check("payouts_completed_at", sql`(${t.status} = 'COMPLETED') = (${t.completedAt} is not null)`),
  ],
).enableRLS();

// A member's rating of another member after sharing a circle. Feeds trust and the loan limit.
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reviews_author_subject_circle_unique").on(t.authorId, t.subjectId, t.circleId),
    index("reviews_subject_id_idx").on(t.subjectId),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
    check("reviews_not_self", sql`${t.authorId} <> ${t.subjectId}`),
    check("reviews_comment_length", sql`${t.comment} is null or char_length(${t.comment}) <= 1000`),
  ],
).enableRLS();

// ── Internal accounts and ledger ─────────────────────────────────────────────
// OpenCircle cannot create Open Payments wallet addresses (only an ASE can), so a user's
// "OpenCircle account" is a balance on this ledger, backed by OpenCircle's single real wallet.
// Every transfer has two legs (from, to) in one row, so the ledger is balanced by construction.
// SYSTEM accounts are the counterparts of money entering the ledger: DEMO_SEED for seeded test
// funds and OP_WALLET for funds that really reached OpenCircle's wallet. Only they may go negative,
// so Σ balances per asset is always 0 and -balance(OP_WALLET) is the part backed by real funds.
// Amounts are integers in the account asset's minor unit; never floats.

export const LEDGER_ACCOUNT_KINDS = ["USER", "CIRCLE_POOL", "SYSTEM"] as const;
export const SYSTEM_ACCOUNT_CODES = ["DEMO_SEED", "OP_WALLET"] as const;
export const LEDGER_TRANSFER_KINDS = ["SEED", "DEPOSIT", "CONTRIBUTION"] as const;
export const DEPOSIT_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;

// `balance` is a cache kept in the same transaction as every transfer:
// balance = Σ transfers.to_account_id = id − Σ transfers.from_account_id = id.
// No cascades: a user or circle with ledger history can't be deleted.
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<(typeof LEDGER_ACCOUNT_KINDS)[number]>().notNull(),
    // USER: the owner. One internal account per user.
    ownerUserId: uuid("owner_user_id")
      .unique()
      .references(() => users.id),
    // CIRCLE_POOL: the circle whose pot this is. One per circle.
    circleId: uuid("circle_id")
      .unique()
      .references(() => circles.id),
    // SYSTEM: which counterpart; one per code and asset.
    systemCode: text("system_code").$type<(typeof SYSTEM_ACCOUNT_CODES)[number]>(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`0`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("ledger_accounts_system_unique").on(t.systemCode, t.assetCode, t.assetScale),
    check("ledger_accounts_kind", sql`${t.kind} in (${inList(LEDGER_ACCOUNT_KINDS)})`),
    check("ledger_accounts_user_owner", sql`(${t.kind} = 'USER') = (${t.ownerUserId} is not null)`),
    check("ledger_accounts_pool_circle", sql`(${t.kind} = 'CIRCLE_POOL') = (${t.circleId} is not null)`),
    check("ledger_accounts_system_code", sql`(${t.kind} = 'SYSTEM') = (${t.systemCode} is not null)`),
    check("ledger_accounts_system_code_values", sql`${t.systemCode} is null or ${t.systemCode} in (${inList(SYSTEM_ACCOUNT_CODES)})`),
    check("ledger_accounts_balance_non_negative", sql`${t.kind} = 'SYSTEM' or ${t.balance} >= 0`),
    check("ledger_accounts_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
  ],
).enableRLS();

// One balanced movement: debit `from`, credit `to`. Idempotent by key: a repeat with the same key
// (e.g. the contribution's idempotency key) finds this row and moves nothing.
export const ledgerTransfers = pgTable(
  "ledger_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    kind: text("kind").$type<(typeof LEDGER_TRANSFER_KINDS)[number]>().notNull(),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    value: bigint("value", { mode: "bigint" }).notNull(),
    // Copied from the accounts so history stays exact; the service checks all three agree.
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_transfers_from_account_created_idx").on(t.fromAccountId, t.createdAt),
    index("ledger_transfers_to_account_created_idx").on(t.toAccountId, t.createdAt),
    check("ledger_transfers_kind", sql`${t.kind} in (${inList(LEDGER_TRANSFER_KINDS)})`),
    check("ledger_transfers_value_positive", sql`${t.value} > 0`),
    check("ledger_transfers_distinct_accounts", sql`${t.fromAccountId} <> ${t.toAccountId}`),
    check("ledger_transfers_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
  ],
).enableRLS();

// A deposit into an internal account from any test-network wallet: a real Open Payments incoming
// payment on OpenCircle's wallet, one per deposit. COMPLETED only once OpenCircle reads the payment
// as received; the matching ledger transfer is keyed `deposit:<id>`.
export const accountDeposits = pgTable(
  "account_deposits",
  {
    // Generated by the service before the Open Payments call, so the payment metadata can carry it.
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    value: bigint("value", { mode: "bigint" }).notNull(),
    assetCode: text("asset_code").notNull(),
    assetScale: integer("asset_scale").notNull(),
    status: text("status").$type<(typeof DEPOSIT_STATUSES)[number]>().notNull().default("PENDING"),
    // Why a deposit FAILED (EXPIRED).
    failureCode: text("failure_code"),
    incomingPaymentUrl: text("incoming_payment_url").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("account_deposits_account_id_created_idx").on(t.accountId, t.createdAt),
    check("account_deposits_status", sql`${t.status} in (${inList(DEPOSIT_STATUSES)})`),
    check("account_deposits_value_positive", sql`${t.value} > 0`),
    check("account_deposits_asset_scale_range", sql`${t.assetScale} between 0 and 255`),
    check("account_deposits_completed_at", sql`(${t.status} = 'COMPLETED') = (${t.completedAt} is not null)`),
    check("account_deposits_failure_code", sql`${t.failureCode} is null or ${t.status} = 'FAILED'`),
  ],
).enableRLS();

export type User = typeof users.$inferSelect;
