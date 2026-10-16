import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { isFinalizedGrantWithAccessToken, isPendingGrant, type WalletAddress } from "@interledger/open-payments";
import type { Db } from "../db/client";
import { auditEvents, consentChallenges, walletGrants } from "../db/schema";
import { AppError } from "../errors/app-error";
import { isAllowedOpenPaymentsUrl, type OpenPaymentsGrantClient } from "./open-payments/client";
import { verifyInteractHash } from "./open-payments/gnap-hash";
import type { TokenCipher } from "./open-payments/token-cipher";
import type { ProfileDto, UserService } from "./user.service";
import { linkWalletInTx, walletInUse } from "./wallet.service";

export interface CompleteConsentInput {
  state: string;
  interactRef: string;
  hash: string;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface WalletConsentDeps {
  db: Db;
  client: OpenPaymentsGrantClient;
  cipher: TokenCipher;
  users: Pick<UserService, "getProfile">;
  /** Next app origin; the wallet redirects to `<frontendUrl>/consent/callback/<state>`. */
  frontendUrl: string;
}

/**
 * Interactive GNAP consent: the user lets OpenCircle create quotes and outgoing
 * payments on their wallet (no limits, by product decision), so contributions can
 * be charged without asking each round. Linking the wallet happens only here,
 * after the wallet's own authorization server confirms the user approved.
 * A user keeps one wallet (see linkWalletInTx); consenting again renews the grant.
 */
export function createWalletConsentService({ db, client, cipher, users: userService, frontendUrl }: WalletConsentDeps) {
  const callbackBase = new URL("/consent/callback/", frontendUrl).toString();

  async function resolveWallet(url: string): Promise<WalletAddress> {
    const notAllowed = new AppError(422, "WALLET_NOT_ALLOWED", "Only Interledger test network wallets are supported");
    if (!isAllowedOpenPaymentsUrl(url)) throw notAllowed;
    const wallet = await client.walletAddress.get({ url });
    if (!isAllowedOpenPaymentsUrl(wallet.id) || !isAllowedOpenPaymentsUrl(wallet.authServer)) throw notAllowed;
    return wallet;
  }

  async function cancelChallenge(id: string): Promise<void> {
    await db.update(consentChallenges).set({ status: "CANCELLED" }).where(eq(consentChallenges.id, id));
  }

  // Best effort: a token we can't use any more should not stay live at the wallet.
  async function revokeRemote(manageUri: string, accessToken: string): Promise<void> {
    try {
      await client.token.revoke({ url: manageUri, accessToken });
    } catch {
      console.error("Grant token revoke failed");
    }
  }

  return {
    /** Starts consent; the caller sends the user to `redirectUrl` (their wallet's consent screen). */
    async start(userId: string, walletUrl: string): Promise<{ redirectUrl: string }> {
      // The profile (POST /users/me) must exist first: consent rows reference it.
      await userService.getProfile(userId);
      const wallet = await resolveWallet(walletUrl);
      const state = randomBytes(32).toString("base64url");
      const clientNonce = randomBytes(24).toString("base64url");

      const grant = await client.grant.request(
        { url: wallet.authServer },
        {
          access_token: {
            access: [
              { type: "outgoing-payment", actions: ["create", "read", "list"], identifier: wallet.id },
              { type: "quote", actions: ["create", "read"] },
            ],
          },
          interact: {
            start: ["redirect"],
            finish: { method: "redirect", uri: `${callbackBase}${state}`, nonce: clientNonce },
          },
        },
      );
      if (!isPendingGrant(grant)) {
        throw new AppError(502, "CONSENT_NOT_INTERACTIVE", "Wallet did not ask the user for consent");
      }

      await db.insert(consentChallenges).values({
        userId,
        state,
        walletAddressUrl: wallet.id,
        grantEndpoint: wallet.authServer,
        clientNonce,
        finishNonce: grant.interact.finish,
        continueUri: grant.continue.uri,
        continueTokenCiphertext: cipher.encrypt(grant.continue.access_token.value),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      });
      return { redirectUrl: grant.interact.redirect };
    },

    /** Finishes consent from the wallet's redirect values; stores the grant and links the wallet. */
    async complete(userId: string, { state, interactRef, hash }: CompleteConsentInput): Promise<ProfileDto> {
      // Claim atomically: single use, this user's own request, not expired.
      const [challenge] = await db
        .update(consentChallenges)
        .set({ status: "COMPLETED" })
        .where(
          and(
            eq(consentChallenges.state, state),
            eq(consentChallenges.userId, userId),
            eq(consentChallenges.status, "PENDING"),
            gt(consentChallenges.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!challenge) {
        throw new AppError(404, "CONSENT_NOT_FOUND", "Consent request not found, already used or expired");
      }

      const hashOk = verifyInteractHash(
        {
          clientNonce: challenge.clientNonce,
          finishNonce: challenge.finishNonce,
          interactRef,
          grantEndpoint: challenge.grantEndpoint,
        },
        hash,
      );
      if (!hashOk) {
        await cancelChallenge(challenge.id);
        throw new AppError(400, "CONSENT_INVALID", "Consent redirect could not be verified");
      }

      let grant;
      try {
        grant = await client.grant.continue(
          { url: challenge.continueUri, accessToken: cipher.decrypt(challenge.continueTokenCiphertext) },
          { interact_ref: interactRef },
        );
      } catch (err) {
        await cancelChallenge(challenge.id);
        throw err;
      }
      if (!isFinalizedGrantWithAccessToken(grant)) {
        await cancelChallenge(challenge.id);
        throw new AppError(502, "CONSENT_NOT_GRANTED", "Wallet did not issue an access token");
      }
      const { value: accessToken, manage: manageUri, expires_in: expiresIn } = grant.access_token;

      let replaced: { manageUri: string; accessTokenCiphertext: string }[];
      try {
        const wallet = await resolveWallet(challenge.walletAddressUrl);
        replaced = await db.transaction(async (tx) => {
          const { wallet: stored } = await linkWalletInTx(tx, userId, wallet);

          // One standing grant per user: a new consent on the same wallet replaces the previous one.
          const previous = await tx
            .update(walletGrants)
            .set({ status: "REVOKED" })
            .where(and(eq(walletGrants.userId, userId), eq(walletGrants.status, "ACTIVE")))
            .returning({
              walletId: walletGrants.walletId,
              manageUri: walletGrants.manageUri,
              accessTokenCiphertext: walletGrants.accessTokenCiphertext,
            });

          await tx.insert(walletGrants).values({
            userId,
            walletId: stored.id,
            accessTokenCiphertext: cipher.encrypt(accessToken),
            manageUri,
            continueUri: grant.continue.uri,
            tokenExpiresAt: expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000),
          });

          await tx.insert(auditEvents).values([
            ...previous.map((p) => ({ walletId: p.walletId, eventType: "wallet.grant_revoked" })),
            { walletId: stored.id, eventType: "wallet.grant_active" },
          ]);
          return previous;
        });
      } catch (err) {
        await revokeRemote(manageUri, accessToken);
        throw walletInUse(err) ?? err;
      }

      for (const old of replaced) await revokeRemote(old.manageUri, cipher.decrypt(old.accessTokenCiphertext));
      return userService.getProfile(userId);
    },
  };
}

export type WalletConsentService = ReturnType<typeof createWalletConsentService>;
