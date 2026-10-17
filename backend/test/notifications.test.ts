import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Db } from "../src/db/client";
import { envSchema } from "../src/config/env-schema";
import { createCircleTick } from "../src/services/circles/circle-cycle";
import { renderEmail } from "../src/services/notifications/email-templates";
import { createResendSender } from "../src/services/notifications/resend-sender";
import { createChannelSender, createLogSender, type Notification } from "../src/services/notifications/sender";

const invite: Notification = {
  channel: "EMAIL",
  to: "ana@example.test",
  kind: "CIRCLE_INVITE",
  circleName: "Natillera Laureles",
  circleId: "c-1",
  inviteId: "i-1",
  inviterName: "Bob R.",
  inviteUrl: "http://localhost:3001/es/circles/c-1?invite=tok",
  expiresAt: new Date("2026-10-24T12:00:00Z"),
};

describe("createLogSender", () => {
  test("invite emails log the invite, never the address, the name or the link", async () => {
    const lines: string[] = [];
    const sender = createLogSender((message, data) => lines.push(`${message} ${JSON.stringify(data)}`));
    await sender.send(invite);
    const line = lines[0] ?? "";
    assert.match(line, /CIRCLE_INVITE/);
    assert.match(line, /i-1/);
    for (const leaked of ["ana@example.test", "Bob R.", "invite=tok", "Natillera"]) assert.ok(!line.includes(leaked), `${leaked} logged`);
  });
});

describe("renderEmail", () => {
  test("an invitation names the circle and the inviter, carries the link and the expiry, in both languages", () => {
    const { subject, text } = renderEmail(invite);
    assert.match(subject, /Bob R\./);
    assert.match(subject, /Natillera Laureles/);
    for (const needle of ["te invitó", "invited you", "http://localhost:3001/es/circles/c-1?invite=tok", "2026-10-24", "mismo correo", "same email"]) {
      assert.ok(text.includes(needle), `missing: ${needle}`);
    }
  });

  test("an invitation without expiry says so", () => {
    const { text } = renderEmail({ ...invite, expiresAt: null });
    assert.match(text, /no vence/);
    assert.match(text, /doesn't expire/);
  });

  test("reminders format the amount from minor units", () => {
    const { subject, text } = renderEmail({
      channel: "EMAIL",
      to: "ana@example.test",
      kind: "LATE",
      circleName: "Natillera",
      deadline: new Date("2026-10-10T00:00:00Z"),
      amount: { value: "2000050", assetCode: "COP", assetScale: 2 },
      contributionId: "k-1",
    });
    assert.match(subject, /Natillera/);
    assert.match(text, /20\.000,50 COP/);
    assert.match(text, /2026-10-10/);
  });
});

describe("createResendSender", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (status: number): typeof fetch => {
    return (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(status === 200 ? "{}" : "secret body", { status });
    }) as typeof fetch;
  };

  test("posts one email to Resend with the bearer key, the sender and the rendered text", async () => {
    calls.length = 0;
    const sender = createResendSender({ apiKey: "re_test", from: "OpenCircle <hola@example.test>", fetch: fakeFetch(200) });
    await sender.send(invite);
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call?.url, "https://api.resend.com/emails");
    assert.equal(call?.init.method, "POST");
    const headers = call?.init.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer re_test");
    const body = JSON.parse(String(call?.init.body)) as { from: string; to: string[]; subject: string; text: string };
    assert.equal(body.from, "OpenCircle <hola@example.test>");
    assert.deepEqual(body.to, ["ana@example.test"]);
    assert.match(body.subject, /Natillera Laureles/);
    assert.match(body.text, /invite=tok/);
  });

  test("a failed send throws with the status only, so it is retried later", async () => {
    const sender = createResendSender({ apiKey: "re_test", from: "x@example.test", fetch: fakeFetch(500) });
    await assert.rejects(sender.send(invite), (err: Error) => {
      assert.match(err.message, /500/);
      assert.ok(!err.message.includes("ana@example.test"));
      assert.ok(!err.message.includes("secret body"));
      return true;
    });
  });

  test("refuses channels it can't deliver", async () => {
    const sender = createResendSender({ apiKey: "re_test", from: "x@example.test", fetch: fakeFetch(200) });
    await assert.rejects(sender.send({ ...invite, channel: "SMS" }), /SMS/);
  });
});

describe("createChannelSender", () => {
  test("routes each notification to its channel's sender", async () => {
    const seen: string[] = [];
    const by = (name: string) => ({ send: async (n: Notification) => void seen.push(`${name}:${n.kind}`) });
    const sender = createChannelSender({ EMAIL: by("email"), SMS: by("sms"), WHATSAPP: by("whatsapp") });
    await sender.send(invite);
    await sender.send({ ...invite, channel: "WHATSAPP" });
    assert.deepEqual(seen, ["email:CIRCLE_INVITE", "whatsapp:CIRCLE_INVITE"]);
  });
});

describe("email env", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    SUPABASE_URL: "https://example.supabase.co",
    FRONTEND_URL: "http://localhost:3001",
    OP_CLIENT_WALLET_ADDRESS: "https://wallet.example/pool",
    OP_KEY_ID: "key",
    OP_PRIVATE_KEY: "key",
    GRANT_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"),
    DIDIT_API_KEY: "key",
    DIDIT_WORKFLOW_ID: "11111111-1111-4111-8111-111111111111",
  };

  test("RESEND_API_KEY and EMAIL_FROM are optional, but go together", () => {
    assert.equal(envSchema.safeParse(base).success, true);
    assert.equal(envSchema.safeParse({ ...base, RESEND_API_KEY: "re_x", EMAIL_FROM: "OpenCircle <a@b.co>" }).success, true);
    assert.equal(envSchema.safeParse({ ...base, RESEND_API_KEY: "re_x" }).success, false);
    assert.equal(envSchema.safeParse({ ...base, EMAIL_FROM: "a@b.co" }).success, false);
  });
});

describe("createCircleTick", () => {
  // No active circles: the tick only retries notices.
  const noCircles = { select: () => ({ from: () => ({ where: async () => [] }) }) } as unknown as Db;
  const cycle = { advanceCircle: async () => undefined };

  test("adds up every notice retrier, and one failing doesn't stop the others", async () => {
    const tick = createCircleTick({
      db: noCircles,
      cycle,
      notices: [
        { retryRecent: async () => 2 },
        {
          retryRecent: async () => {
            throw new Error("mail down");
          },
        },
        { retryRecent: async () => 3 },
      ],
    });
    assert.deepEqual(await tick.run(), { circles: 0, failed: 0, noticesResent: 5 });
  });

  test("retries the last seven days", async () => {
    const since: Date[] = [];
    const now = new Date("2026-10-17T00:00:00Z");
    const tick = createCircleTick({ db: noCircles, cycle, notices: [{ retryRecent: async (s) => (since.push(s), 0) }], now: () => now });
    await tick.run();
    assert.deepEqual(since, [new Date("2026-10-10T00:00:00Z")]);
  });
});
