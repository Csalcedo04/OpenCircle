import assert from "node:assert/strict";
import { test } from "node:test";
import { toWalletAddressUrl, walletAddressInputSchema } from "../src/services/open-payments/payment-pointer";

test("payment pointer with path becomes an https wallet address URL", () => {
  assert.equal(toWalletAddressUrl("$ilp.interledger-test.dev/carlos-dev"), "https://ilp.interledger-test.dev/carlos-dev");
});

test("bare payment pointer resolves to /.well-known/pay", () => {
  assert.equal(toWalletAddressUrl("$wallet.example"), "https://wallet.example/.well-known/pay");
});

test("https wallet address URL is kept and surrounding spaces are trimmed", () => {
  assert.equal(toWalletAddressUrl("  https://ilp.interledger-test.dev/carlos-dev "), "https://ilp.interledger-test.dev/carlos-dev");
});

test("rejects inputs the server must not fetch", () => {
  for (const input of [
    "http://ilp.interledger-test.dev/carlos-dev",
    "ftp://wallet.example/alice",
    "https://user:pass@wallet.example/alice",
    "https://wallet.example/alice?x=1",
    "https://wallet.example/alice#frag",
    "carlos-dev",
    "",
  ]) {
    assert.equal(toWalletAddressUrl(input), null, input);
  }
});

test("zod schema transforms valid input and reports invalid input", () => {
  assert.equal(walletAddressInputSchema.parse("$wallet.example/alice"), "https://wallet.example/alice");
  assert.equal(walletAddressInputSchema.safeParse("http://wallet.example/alice").success, false);
});
