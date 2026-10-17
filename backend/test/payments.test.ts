import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import {
  AccessTokenExpiredError,
  createContributionPayments,
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
    },
    quote: { create: route("quote.create", () => ({ id: `${RS}/quotes/q1` })) },
    outgoingPayment: {
      create: route("outgoingPayment.create", () => ({ id: `${RS}/outgoing-payments/op1` })),
      list: route("outgoingPayment.list", () => ({ pagination: { hasNextPage: false }, result: [] })),
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
