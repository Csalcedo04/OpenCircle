import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import {
  AccessTokenExpiredError,
  createContributionPayments,
  createPayoutPayments,
  PaymentRefusedError,
  type ContributionPaymentsClient,
} from "../src/services/open-payments/payments";

const POOL = "https://ilp.interledger-test.dev/pool";
const MEMBER = "https://ilp.interledger-test.dev/ana";
const RS = "https://ilp.interledger-test.dev";
const AS = "https://auth.interledger-test.dev";

type Call = [string, unknown, unknown?];

// Records every SDK call; individual routes can be overridden per test.
function fakeClient(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const calls: Call[] = [];
  const route =
    (name: string, impl: (a: unknown, b?: unknown) => unknown) =>
    async (a: unknown, b?: unknown) => {
      calls.push(b === undefined ? [name, a] : [name, a, b]);
      return (overrides[name] ?? impl)(a, b);
    };
  const client = {
    walletAddress: {
      get: route("walletAddress.get", (a) => ({
        id: (a as { url: string }).url,
        assetCode: "USD",
        assetScale: 2,
        authServer: AS,
        resourceServer: RS,
      })),
    },
    grant: {
      request: route("grant.request", () => ({
        access_token: { value: "pool-token", manage: `${AS}/token/1`, expires_in: 600, access: [] },
        continue: { uri: `${AS}/continue/1`, access_token: { value: "c" } },
      })),
    },
    token: {
      rotate: route("token.rotate", () => ({ access_token: { value: "new-token", manage: `${AS}/token/2`, expires_in: 600, access: [] } })),
    },
    incomingPayment: {
      create: route("incomingPayment.create", () => ({ id: `${RS}/incoming-payments/ip1` })),
      get: route("incomingPayment.get", () => ({ id: `${RS}/incoming-payments/ip1`, completed: true, receivedAmount: { value: "500", assetCode: "USD", assetScale: 2 } })),
      complete: route("incomingPayment.complete", () => ({ id: `${RS}/incoming-payments/ip1`, completed: true })),
    },
    quote: { create: route("quote.create", () => ({ id: `${RS}/quotes/q1` })) },
    outgoingPayment: {
      create: route("outgoingPayment.create", () => ({ id: `${RS}/outgoing-payments/op1` })),
      list: route("outgoingPayment.list", () => ({ pagination: { hasNextPage: false }, result: [] })),
      get: route("outgoingPayment.get", () => ({ id: `${RS}/outgoing-payments/op1`, failed: false })),
    },
  } as unknown as ContributionPaymentsClient;
  return { client, calls };
}

const refused = (status: number) => () => {
  throw new OpenPaymentsClientError("refused", { description: "refused", status });
};

describe("contribution payments", () => {
  test("incoming payment on the pool wallet for the exact amount, tagged with the key", async () => {
    const { client, calls } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    const expiresAt = new Date("2026-02-28T12:00:00Z");
    const { url } = await payments.createIncomingPayment({ amount: { value: "500", assetCode: "USD", assetScale: 2 }, key: "contribution:r:m", expiresAt });

    assert.equal(url, `${RS}/incoming-payments/ip1`);
    assert.deepEqual(calls.find((c) => c[0] === "grant.request")?.slice(1), [
      { url: AS },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
    ]);
    assert.deepEqual(calls.find((c) => c[0] === "incomingPayment.create")?.slice(1), [
      { url: RS, accessToken: "pool-token" },
      { walletAddress: POOL, incomingAmount: { value: "500", assetCode: "USD", assetScale: 2 }, expiresAt: expiresAt.toISOString(), metadata: { contributionKey: "contribution:r:m" } },
    ]);
  });

  test("the pool token is reused until it nears expiry", async () => {
    let clock = 0;
    const { client, calls } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL, now: () => clock });
    await payments.readIncomingPayment(`${RS}/incoming-payments/ip1`);
    await payments.readIncomingPayment(`${RS}/incoming-payments/ip1`);
    assert.equal(calls.filter((c) => c[0] === "grant.request").length, 1);
    clock = 600_000;
    await payments.readIncomingPayment(`${RS}/incoming-payments/ip1`);
    assert.equal(calls.filter((c) => c[0] === "grant.request").length, 2);
  });

  test("reads what arrived as an integer amount", async () => {
    const { client } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    assert.deepEqual(await payments.readIncomingPayment(`${RS}/incoming-payments/ip1`), { received: 500n, completed: true });
  });

  test("refuses resources outside the test network", async () => {
    const { client } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    await assert.rejects(payments.readIncomingPayment("https://evil.example/incoming-payments/1"));
    await assert.rejects(payments.payFromMember({ walletAddressUrl: "https://evil.example/ana", accessToken: "t" }, { incomingPaymentUrl: "x", key: "k" }));
  });

  test("member pays: quote then outgoing payment on the member's resource server, with the key", async () => {
    const { client, calls } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    const result = await payments.payFromMember({ walletAddressUrl: MEMBER, accessToken: "ana-token" }, { incomingPaymentUrl: `${RS}/incoming-payments/ip1`, key: "k1" });

    assert.deepEqual(result, { quoteUrl: `${RS}/quotes/q1`, outgoingPaymentUrl: `${RS}/outgoing-payments/op1` });
    assert.deepEqual(calls.find((c) => c[0] === "quote.create")?.slice(1), [
      { url: RS, accessToken: "ana-token" },
      { method: "ilp", walletAddress: MEMBER, receiver: `${RS}/incoming-payments/ip1` },
    ]);
    assert.deepEqual(calls.find((c) => c[0] === "outgoingPayment.create")?.slice(1), [
      { url: RS, accessToken: "ana-token" },
      { walletAddress: MEMBER, quoteId: `${RS}/quotes/q1`, metadata: { contributionKey: "k1" } },
    ]);
  });

  test("401 means the token expired; other 4xx means refused", async () => {
    const access = { walletAddressUrl: MEMBER, accessToken: "t" };
    const args = { incomingPaymentUrl: `${RS}/incoming-payments/ip1`, key: "k" };
    const expired = createContributionPayments({ client: fakeClient({ "quote.create": refused(401) }).client, poolWalletAddressUrl: POOL });
    await assert.rejects(expired.payFromMember(access, args), AccessTokenExpiredError);

    const noQuote = createContributionPayments({ client: fakeClient({ "quote.create": refused(400) }).client, poolWalletAddressUrl: POOL });
    await assert.rejects(noQuote.payFromMember(access, args), (e) => e instanceof PaymentRefusedError && e.step === "quote");

    const noPay = createContributionPayments({ client: fakeClient({ "outgoingPayment.create": refused(403) }).client, poolWalletAddressUrl: POOL });
    await assert.rejects(noPay.payFromMember(access, args), (e) => e instanceof PaymentRefusedError && e.step === "outgoing-payment");

    const down = createContributionPayments({ client: fakeClient({ "quote.create": refused(503) }).client, poolWalletAddressUrl: POOL });
    await assert.rejects(down.payFromMember(access, args), OpenPaymentsClientError);
  });

  test("finds an earlier outgoing payment by its key across pages", async () => {
    let page = 0;
    const { client } = fakeClient({
      "outgoingPayment.list": () =>
        page++ === 0
          ? { pagination: { hasNextPage: true, endCursor: "c1" }, result: [{ id: "op-other", metadata: { contributionKey: "other" } }] }
          : { pagination: { hasNextPage: false }, result: [{ id: "op-mine", metadata: { contributionKey: "k1" } }] },
    });
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    assert.deepEqual(await payments.findMemberPayment({ walletAddressUrl: MEMBER, accessToken: "t" }, "k1"), { outgoingPaymentUrl: "op-mine" });
    page = 0;
    assert.equal(await payments.findMemberPayment({ walletAddressUrl: MEMBER, accessToken: "t" }, "missing"), null);
  });

  test("rotating returns the new token and manage URI", async () => {
    const { client, calls } = fakeClient();
    const payments = createContributionPayments({ client, poolWalletAddressUrl: POOL });
    assert.deepEqual(await payments.rotateToken({ manageUri: `${AS}/token/1`, accessToken: "old" }), {
      accessToken: "new-token",
      manageUri: `${AS}/token/2`,
      expiresIn: 600,
    });
    assert.deepEqual(calls.find((c) => c[0] === "token.rotate")?.slice(1), [{ url: `${AS}/token/1`, accessToken: "old" }]);
  });
});

describe("payout payments (pool → member)", () => {
  const POOL_ACCESS = { walletAddressUrl: POOL, accessToken: "pool-outgoing-token" };
  const receiveAmount = { value: "281", assetCode: "EUR", assetScale: 2 };
  const debitAmount = { value: "1000000", assetCode: "COP", assetScale: 2 };

  test("open incoming payment on the member's wallet: non-interactive grant on their AS, no fixed amount, tagged", async () => {
    const { client, calls } = fakeClient();
    const payouts = createPayoutPayments({ client });
    const expiresAt = new Date("2026-03-01T00:00:00Z");
    const { url } = await payouts.createMemberIncomingPayment(MEMBER, { key: "payout:round:r1", expiresAt });

    assert.equal(url, `${RS}/incoming-payments/ip1`);
    assert.deepEqual(calls.find((c) => c[0] === "grant.request")?.slice(1), [
      { url: AS },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
    ]);
    assert.deepEqual(calls.find((c) => c[0] === "incomingPayment.create")?.slice(1), [
      { url: RS, accessToken: "pool-token" },
      { walletAddress: MEMBER, expiresAt: expiresAt.toISOString(), metadata: { payoutKey: "payout:round:r1" } },
    ]);
  });

  test("one token per member authorization server, reused until it nears expiry", async () => {
    const OTHER_AS = "https://auth.other.interledger-test.dev";
    let t = 0;
    const { client, calls } = fakeClient({
      "walletAddress.get": (a) => {
        const url = (a as { url: string }).url;
        return { id: url, assetCode: "EUR", assetScale: 2, authServer: url.endsWith("/bea") ? OTHER_AS : AS, resourceServer: RS };
      },
    });
    const payouts = createPayoutPayments({ client, now: () => t });
    const expiresAt = new Date();
    await payouts.createMemberIncomingPayment(MEMBER, { key: "k1", expiresAt });
    await payouts.readMemberIncomingPayment(MEMBER, `${RS}/incoming-payments/ip1`);
    await payouts.createMemberIncomingPayment("https://ilp.interledger-test.dev/bea", { key: "k2", expiresAt });
    assert.deepEqual(
      calls.filter((c) => c[0] === "grant.request").map((c) => (c[1] as { url: string }).url),
      [AS, OTHER_AS],
    );
    t = 600_000;
    await payouts.completeMemberIncomingPayment(MEMBER, `${RS}/incoming-payments/ip1`);
    assert.equal(calls.filter((c) => c[0] === "grant.request").length, 3);
  });

  test("reads what the member received (in their asset) and completes the incoming payment", async () => {
    const { client, calls } = fakeClient({
      "incomingPayment.get": () => ({ id: `${RS}/incoming-payments/ip1`, completed: false, receivedAmount: receiveAmount }),
    });
    const payouts = createPayoutPayments({ client });
    assert.deepEqual(await payouts.readMemberIncomingPayment(MEMBER, `${RS}/incoming-payments/ip1`), { received: receiveAmount });
    await payouts.completeMemberIncomingPayment(MEMBER, `${RS}/incoming-payments/ip1`);
    assert.deepEqual(calls.find((c) => c[0] === "incomingPayment.complete")?.[1], { url: `${RS}/incoming-payments/ip1`, accessToken: "pool-token" });
  });

  test("pool pays with a fixed debit: quote with debitAmount, outgoing payment tagged; returns what it delivers", async () => {
    const { client, calls } = fakeClient({
      "outgoingPayment.create": () => ({ id: `${RS}/outgoing-payments/op1`, quoteId: `${RS}/quotes/q1`, receiveAmount, debitAmount }),
    });
    const payouts = createPayoutPayments({ client });
    const sent = await payouts.payFromPool(POOL_ACCESS, { incomingPaymentUrl: `${RS}/incoming-payments/ip9`, key: "payout:final:c:m", debitAmount });

    assert.deepEqual(sent, { quoteUrl: `${RS}/quotes/q1`, outgoingPaymentUrl: `${RS}/outgoing-payments/op1`, receiveAmount });
    assert.deepEqual(calls.find((c) => c[0] === "quote.create")?.slice(1), [
      { url: RS, accessToken: "pool-outgoing-token" },
      { method: "ilp", walletAddress: POOL, receiver: `${RS}/incoming-payments/ip9`, debitAmount },
    ]);
    assert.deepEqual(calls.find((c) => c[0] === "outgoingPayment.create")?.slice(1), [
      { url: RS, accessToken: "pool-outgoing-token" },
      { walletAddress: POOL, quoteId: `${RS}/quotes/q1`, metadata: { payoutKey: "payout:final:c:m" } },
    ]);
    // The pool's token is the owner's stored grant: no grant request for paying.
    assert.equal(calls.filter((c) => c[0] === "grant.request").length, 0);
  });

  test("a refused quote → PaymentRefusedError; an expired token → AccessTokenExpiredError", async () => {
    for (const [status, error] of [
      [400, PaymentRefusedError],
      [401, AccessTokenExpiredError],
    ] as const) {
      const payouts = createPayoutPayments({ client: fakeClient({ "quote.create": refused(status) }).client });
      await assert.rejects(payouts.payFromPool(POOL_ACCESS, { incomingPaymentUrl: `${RS}/incoming-payments/ip1`, key: "k", debitAmount }), error);
    }
  });

  test("finds an earlier pool payment by its payout key, never by a contribution key", async () => {
    const tagged = (metadata: Record<string, string>, id: string) => ({ id, metadata, receiveAmount });
    const { client } = fakeClient({
      "outgoingPayment.list": () => ({
        pagination: { hasNextPage: false },
        result: [tagged({ contributionKey: "payout:round:r1" }, `${RS}/outgoing-payments/a`), tagged({ payoutKey: "payout:round:r1" }, `${RS}/outgoing-payments/b`)],
      }),
    });
    const payouts = createPayoutPayments({ client });
    assert.deepEqual(await payouts.findPoolPayment(POOL_ACCESS, "payout:round:r1"), {
      quoteUrl: null,
      outgoingPaymentUrl: `${RS}/outgoing-payments/b`,
      receiveAmount,
    });
    assert.equal(await payouts.findPoolPayment(POOL_ACCESS, "payout:round:r2"), null);
  });

  test("reads whether the pool's outgoing payment failed", async () => {
    const failing = createPayoutPayments({ client: fakeClient({ "outgoingPayment.get": () => ({ id: "x", failed: true }) }).client });
    assert.deepEqual(await failing.readPoolPayment(POOL_ACCESS, `${RS}/outgoing-payments/op1`), { failed: true });
    const fine = createPayoutPayments({ client: fakeClient().client });
    assert.deepEqual(await fine.readPoolPayment(POOL_ACCESS, `${RS}/outgoing-payments/op1`), { failed: false });
  });

  test("refuses wallets and payments outside the test network", async () => {
    const payouts = createPayoutPayments({ client: fakeClient().client });
    await assert.rejects(payouts.createMemberIncomingPayment("https://evil.example/ana", { key: "k", expiresAt: new Date() }), /test network/);
    await assert.rejects(payouts.readMemberIncomingPayment(MEMBER, "https://evil.example/ip"), /test network/);
    await assert.rejects(payouts.payFromPool(POOL_ACCESS, { incomingPaymentUrl: "https://evil.example/ip", key: "k", debitAmount }), /test network/);
  });
});
