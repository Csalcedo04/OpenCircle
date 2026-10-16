import { z } from "zod";

const BASE_URL = "https://verification.didit.me/v3";

/**
 * Didit session statuses (https://docs.didit.me/integration/verification-statuses).
 * Only `Approved` lets a user into circles.
 */
export const KYC_STATUSES = [
  "Not Started",
  "In Progress",
  "Approved",
  "Declined",
  "In Review",
  "Awaiting User",
  "Resubmitted",
  "Expired",
  "Abandoned",
  "Kyc Expired",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

/** No further change without a new session (Approved may still become Kyc Expired). */
export const FINAL_KYC_STATUSES: readonly KycStatus[] = ["Approved", "Declined", "Expired", "Abandoned", "Kyc Expired"];

// Only the fields we use: Didit responses also carry personal data that must not be stored.
const sessionSchema = z.object({ session_id: z.uuid(), url: z.url(), status: z.enum(KYC_STATUSES) });
const decisionSchema = z.object({ session_id: z.uuid(), status: z.enum(KYC_STATUSES), vendor_data: z.string().nullable() });

/** What the user entered at onboarding; Didit compares it with the scanned document (mismatches are warnings). */
export interface ExpectedDetails {
  identificationNumber: string;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  /** Didit document codes: ID (national ID card), P (passport). */
  documentTypes: ("ID" | "P")[];
}

export interface DiditClient {
  createSession(args: {
    vendorData: string;
    callback: string;
    language: string;
    expected: ExpectedDetails;
  }): Promise<{ sessionId: string; url: string; status: KycStatus }>;
  getDecision(sessionId: string): Promise<{ status: KycStatus; vendorData: string | null }>;
}

export class DiditError extends Error {
  constructor(readonly status: number) {
    super(`Didit request failed with HTTP ${status}`);
    this.name = "DiditError";
  }
}

export function createDiditClient({ apiKey, workflowId }: { apiKey: string; workflowId: string }): DiditClient {
  async function call(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new DiditError(res.status);
    return res.json();
  }

  return {
    async createSession({ vendorData, callback, language, expected }) {
      const body = {
        workflow_id: workflowId,
        vendor_data: vendorData,
        callback,
        language,
        expected_details: {
          identification_number: expected.identificationNumber,
          ...(expected.dateOfBirth === null ? {} : { date_of_birth: expected.dateOfBirth }),
          expected_document_types: expected.documentTypes,
        },
      };
      const session = sessionSchema.parse(await call("/session/", { method: "POST", body: JSON.stringify(body) }));
      return { sessionId: session.session_id, url: session.url, status: session.status };
    },
    async getDecision(sessionId) {
      const decision = decisionSchema.parse(await call(`/session/${encodeURIComponent(sessionId)}/decision/`, { method: "GET" }));
      return { status: decision.status, vendorData: decision.vendor_data };
    },
  };
}
