import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditEvents, kycVerifications, users } from "../db/schema";
import { AppError } from "../errors/app-error";
import { FINAL_KYC_STATUSES, type DiditClient, type KycStatus } from "./didit/client";
import type { DocumentType } from "./user.service";

export interface StartKycInput {
  locale: "en" | "es";
  /** In-app path to return to after Didit (validated at the HTTP boundary). */
  returnPath: string;
}

// Colombian IDs (cc, ti, ce) are national ID cards for Didit; pp is a passport.
const diditDocumentType: Record<DocumentType, "ID" | "P"> = { cc: "ID", ti: "ID", ce: "ID", pp: "P" };

export interface KycView {
  /** Latest session's status; null if the user never started KYC. */
  status: KycStatus | null;
  /** Only `Approved` lets a user create or join circles. */
  approved: boolean;
}

type KycRow = typeof kycVerifications.$inferSelect;

const auditType = (status: KycStatus) => `kyc.${status.toLowerCase().replace(/ /g, "_")}`;

/**
 * Identity verification with Didit. The status comes only from Didit itself:
 * a server-to-server decision read or a signed webhook, never from the
 * browser's return URL.
 */
export function createKycService({ db, didit, frontendUrl }: { db: Db; didit: DiditClient; frontendUrl: string }) {
  async function latest(userId: string): Promise<KycRow | null> {
    const [row] = await db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .orderBy(desc(kycVerifications.createdAt))
      .limit(1);
    return row ?? null;
  }

  async function audit(userId: string, status: KycStatus): Promise<void> {
    const [user] = await db.select({ wallet: users.opWallet }).from(users).where(eq(users.id, userId)).limit(1);
    if (user?.wallet) await db.insert(auditEvents).values({ walletId: user.wallet, eventType: auditType(status) });
  }

  // Webhooks can arrive late or out of order: a final status only moves to Kyc Expired.
  async function applyStatus(row: KycRow, status: KycStatus): Promise<KycStatus> {
    if (row.status === status) return status;
    const current = row.status as KycStatus;
    if (FINAL_KYC_STATUSES.includes(current) && !(current === "Approved" && status === "Kyc Expired")) return current;

    await db.update(kycVerifications).set({ status }).where(eq(kycVerifications.id, row.id));
    await audit(row.userId, status);
    return status;
  }

  async function getStatus(userId: string): Promise<KycView> {
    const row = await latest(userId);
    if (!row) return { status: null, approved: false };

    let status = row.status as KycStatus;
    if (!FINAL_KYC_STATUSES.includes(status)) {
      try {
        const decision = await didit.getDecision(row.sessionId);
        if (decision.vendorData === userId) status = await applyStatus(row, decision.status);
      } catch {
        // Keep the stored status; the next read or webhook catches up.
        console.error("Didit decision read failed");
      }
    }
    return { status, approved: status === "Approved" };
  }

  return {
    getStatus,

    /** Creates (or resumes) a Didit session; the caller sends the user to `url`. */
    async startSession(userId: string, { locale, returnPath }: StartKycInput): Promise<{ url: string }> {
      const [user] = await db
        .select({
          wallet: users.opWallet,
          documentType: users.documentType,
          documentNumber: users.documentNumber,
          dob: users.dob,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user?.wallet) throw new AppError(409, "ONBOARDING_REQUIRED", "Finish onboarding before verifying your identity");
      if ((await getStatus(userId)).approved) throw new AppError(409, "KYC_ALREADY_APPROVED", "Identity already verified");

      const callback = new URL(`/${locale}/kyc/callback`, frontendUrl);
      callback.searchParams.set("next", returnPath);
      // vendor_data is our user id only, no PII. Didit returns the unfinished session for it if one exists.
      const session = await didit.createSession({
        vendorData: userId,
        callback: callback.toString(),
        language: locale,
        expected: {
          identificationNumber: user.documentNumber,
          dateOfBirth: user.dob,
          documentTypes: [diditDocumentType[user.documentType]],
        },
      });

      const inserted = await db
        .insert(kycVerifications)
        .values({ userId, sessionId: session.sessionId, status: session.status })
        .onConflictDoNothing({ target: kycVerifications.sessionId })
        .returning({ id: kycVerifications.id });
      if (inserted.length > 0) await audit(userId, session.status);
      return { url: session.url };
    },

    /** Applies a verified webhook; unknown sessions are ignored so Didit doesn't retry them. */
    async handleWebhook({ sessionId, status, vendorData }: { sessionId: string; status: KycStatus; vendorData: string | null }) {
      const [row] = await db.select().from(kycVerifications).where(eq(kycVerifications.sessionId, sessionId)).limit(1);
      if (!row || row.userId !== vendorData) {
        console.log(JSON.stringify({ at: new Date().toISOString(), webhook: "didit", step: "not-applied", sessionId, reason: row ? "VENDOR_DATA_MISMATCH" : "UNKNOWN_SESSION" }));
        return "ignored" as const;
      }
      await applyStatus(row, status);
      return "applied" as const;
    },
  };
}

export type KycService = ReturnType<typeof createKycService>;
