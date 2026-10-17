import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, inArray, like, or } from "drizzle-orm";
import { createDb, type Db } from "../src/db/client";
import { circleMembers, circles, friendships, users, wallets } from "../src/db/schema";
import type { FriendDto, FriendRequestDto } from "../src/services/friend.service";
import { createFriendService } from "../src/services/friend.service";
import { createNotificationService, type NotificationDto, type NotificationList } from "../src/services/notification.service";
import { createUserService } from "../src/services/user.service";
import { displayName } from "../src/services/display-name";
import { setupTestAuth, type TestAuth } from "./helpers/auth";
import { fakeServices } from "./helpers/fakes";
import { errorCode, startServer, type TestServer } from "./helpers/server";

// Runs against the database in DATABASE_URL (Supabase). Its rows use the "[test-friends] " name
// prefix and wallets under https://friends.test/, and are deleted before and after the run.
const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "[test-friends] ";
const WALLET_HOST = "friends.test";

let db: Db;
let server: TestServer;
let auth: TestAuth;
const createdUserIds: string[] = [];

async function deleteTestData(): Promise<void> {
  const testCircles = (await db.select({ id: circles.id }).from(circles).where(like(circles.name, `${PREFIX}%`))).map((c) => c.id);
  if (testCircles.length > 0) {
    await db.delete(circleMembers).where(inArray(circleMembers.circleId, testCircles));
    await db.delete(circles).where(inArray(circles.id, testCircles));
  }
  // Friendships cascade with their users; deleting them first keeps the order explicit.
  if (createdUserIds.length > 0) {
    await db.delete(friendships).where(or(inArray(friendships.requesterId, createdUserIds), inArray(friendships.addresseeId, createdUserIds)));
  }
  await db.delete(users).where(or(like(users.fullName, `${PREFIX}%`), createdUserIds.length > 0 ? inArray(users.id, createdUserIds) : undefined));
  await db.delete(wallets).where(like(wallets.addressUrl, `https://${WALLET_HOST}/%`));
}

interface Person {
  id: string;
  email: string;
  token: string;
}

async function person(name = "Ana María Gómez"): Promise<Person> {
  const id = randomUUID();
  createdUserIds.push(id);
  const email = `${id}@example.test`;
  const [wallet] = await db
    .insert(wallets)
    .values({ addressUrl: `https://${WALLET_HOST}/${id}`, assetCode: "COP", assetScale: 2 })
    .returning({ id: wallets.id });
  await db.insert(users).values({
    id,
    email,
    documentType: "cc",
    documentNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
    nationality: "CO",
    fullName: `${PREFIX}${name}`,
    opWallet: wallet?.id ?? null,
  });
  return { id, email, token: await auth.token(id) };
}

// Two people who share a circle can see each other's profile.
async function shareCircle(a: Person, b: Person): Promise<void> {
  const [wallet] = await db
    .insert(wallets)
    .values({ addressUrl: `https://${WALLET_HOST}/pool-${randomUUID()}`, assetCode: "COP", assetScale: 2 })
    .returning({ id: wallets.id });
  const [circle] = await db
    .insert(circles)
    .values({ name: `${PREFIX}Natillera`, city: "Medellín", contributionValue: 100n, assetCode: "COP", assetScale: 2, roundLengthDays: 7, size: 2, poolWalletId: wallet?.id ?? "", createdBy: a.id })
    .returning({ id: circles.id });
  await db.insert(circleMembers).values([
    { circleId: circle?.id ?? "", userId: a.id, payoutRound: 1, isApprover: true },
    { circleId: circle?.id ?? "", userId: b.id, payoutRound: 2 },
  ]);
}

const friendsOf = async (p: Person) => (await server.request("/api/friends", { token: p.token })).body as FriendDto[];
const requestsOf = async (p: Person) =>
  (await server.request("/api/friends/requests", { token: p.token })).body as { incoming: FriendRequestDto[]; outgoing: FriendRequestDto[] };
const request = (from: Person, body: Record<string, unknown>) => server.request("/api/friends/requests", { method: "POST", token: from.token, body });
const accept = (who: Person, id: string) => server.request(`/api/friends/requests/${id}/accept`, { method: "POST", token: who.token });
const cancel = (who: Person, id: string) => server.request(`/api/friends/requests/${id}`, { method: "DELETE", token: who.token });
const remove = (who: Person, friendId: string) => server.request(`/api/friends/${friendId}`, { method: "DELETE", token: who.token });
const profile = (viewer: Person, target: Person) => server.request(`/api/users/${target.id}/public`, { token: viewer.token });

async function befriend(a: Person, b: Person): Promise<void> {
  const sent = await request(a, { email: b.email });
  assert.equal(sent.status, 201, sent.text);
  const accepted = await accept(b, (sent.body as FriendRequestDto).id);
  assert.equal(accepted.status, 200, accepted.text);
}

describe("friends API against Supabase", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(async () => {
    auth = await setupTestAuth();
    db = createDb(databaseUrl ?? "");
    await deleteTestData();
    const notifications = createNotificationService({ db, frontendUrl: "http://localhost:3001" });
    server = await startServer(fakeServices({ users: createUserService(db), friends: createFriendService({ db, notifications }), notifications }));
  });

  after(async () => {
    await deleteTestData();
    await server.close();
    await db.$client.end();
  });

  test("a request by exact email (any case) shows as outgoing for one and incoming for the other", async () => {
    const [ana, bob] = await Promise.all([person("Ana Gómez"), person("Bob Ruiz")]);
    const res = await request(ana, { email: bob.email.toUpperCase() });
    assert.equal(res.status, 201, res.text);
    const sent = res.body as FriendRequestDto;
    assert.deepEqual(sent.from, { userId: ana.id, displayName: displayName(`${PREFIX}Ana Gómez`) });
    assert.deepEqual(sent.to, { userId: bob.id, displayName: displayName(`${PREFIX}Bob Ruiz`) });
    assert.ok(!res.text.includes("@"), "an email leaked");

    assert.deepEqual((await requestsOf(ana)).outgoing.map((r) => r.id), [sent.id]);
    assert.deepEqual((await requestsOf(ana)).incoming, []);
    assert.deepEqual((await requestsOf(bob)).incoming.map((r) => r.id), [sent.id]);
    assert.deepEqual(await friendsOf(ana), []);
  });

  test("a request by user id needs a visible profile: circle mates yes, strangers 404", async () => {
    const [ana, mate, stranger] = await Promise.all([person(), person(), person()]);
    await shareCircle(ana, mate);
    assert.equal((await request(ana, { userId: mate.id })).status, 201);
    const hidden = await request(ana, { userId: stranger.id });
    assert.equal(hidden.status, 404);
    assert.equal(errorCode(hidden.body), "PROFILE_NOT_FOUND");
    const unknownEmail = await request(ana, { email: `nobody-${randomUUID()}@example.test` });
    assert.equal(unknownEmail.status, 404);
    assert.equal(errorCode(unknownEmail.body), "PROFILE_NOT_FOUND");
  });

  test("not yourself, not twice in either direction, not when already friends", async () => {
    const [ana, bob, carol] = await Promise.all([person(), person(), person()]);
    const self = await request(ana, { email: ana.email });
    assert.equal(self.status, 422);
    assert.equal(errorCode(self.body), "CANNOT_FRIEND_SELF");

    assert.equal((await request(ana, { email: bob.email })).status, 201);
    for (const res of [await request(ana, { email: bob.email }), await request(bob, { email: ana.email })]) {
      assert.equal(res.status, 409);
      assert.equal(errorCode(res.body), "FRIEND_REQUEST_PENDING");
    }

    await befriend(ana, carol);
    const again = await request(carol, { email: ana.email });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), "ALREADY_FRIENDS");
  });

  test("accepting lists each other as friends; removing works from either side and allows a new request", async () => {
    const [ana, bob] = await Promise.all([person("Ana Gómez"), person("Bob Ruiz")]);
    await befriend(ana, bob);
    const [anasFriend] = await friendsOf(ana);
    assert.equal(anasFriend?.userId, bob.id);
    assert.equal(anasFriend?.displayName, displayName(`${PREFIX}Bob Ruiz`));
    assert.ok(anasFriend?.since);
    assert.deepEqual((await friendsOf(bob)).map((f) => f.userId), [ana.id]);
    assert.deepEqual(await requestsOf(ana), { incoming: [], outgoing: [] });

    assert.equal((await remove(bob, ana.id)).status, 204);
    assert.deepEqual(await friendsOf(ana), []);
    assert.deepEqual(await friendsOf(bob), []);
    const gone = await remove(ana, bob.id);
    assert.equal(gone.status, 404);
    assert.equal(errorCode(gone.body), "FRIEND_NOT_FOUND");
    assert.equal((await request(bob, { email: ana.email })).status, 201, "a new request after removal");
  });

  test("only the addressee accepts; rejecting or withdrawing deletes the request; third parties get 404", async () => {
    const [ana, bob, carol] = await Promise.all([person(), person(), person()]);
    const first = (await request(ana, { email: bob.email })).body as FriendRequestDto;
    const byRequester = await accept(ana, first.id);
    assert.equal(byRequester.status, 404);
    assert.equal(errorCode(byRequester.body), "FRIEND_REQUEST_NOT_FOUND");
    assert.equal((await accept(carol, first.id)).status, 404);
    assert.equal((await cancel(carol, first.id)).status, 404);

    assert.equal((await cancel(bob, first.id)).status, 204, "the addressee rejects");
    assert.deepEqual(await requestsOf(ana), { incoming: [], outgoing: [] });
    assert.equal((await accept(bob, first.id)).status, 404);

    const second = (await request(ana, { email: bob.email })).body as FriendRequestDto;
    assert.equal((await cancel(ana, second.id)).status, 204, "the requester withdraws");
    assert.deepEqual((await requestsOf(bob)).incoming, []);
    assert.equal((await db.select().from(friendships).where(eq(friendships.id, second.id))).length, 0);
  });

  test("friends and people with a pending request can see each other's profile", async () => {
    const [ana, bob, carol] = await Promise.all([person(), person(), person()]);
    assert.equal((await profile(bob, ana)).status, 404);
    const sent = (await request(ana, { email: bob.email })).body as FriendRequestDto;
    assert.equal((await profile(bob, ana)).status, 200, "the addressee can see who is asking");
    assert.equal((await profile(ana, bob)).status, 200);
    assert.equal((await profile(carol, ana)).status, 404);
    assert.equal((await accept(bob, sent.id)).status, 200);
    assert.equal((await profile(bob, ana)).status, 200);
  });

  test("friend requests are rate limited per user → 429", async () => {
    const ana = await person();
    const others = await Promise.all(Array.from({ length: 10 }, () => person()));
    for (const other of others) assert.equal((await request(ana, { email: other.email })).status, 201);
    const limited = await request(ana, { email: others[0]?.email });
    assert.equal(limited.status, 429);
    assert.equal(errorCode(limited.body), "RATE_LIMITED");
  });

  test("a request notifies the addressee once; answering or withdrawing it takes the notification away", async () => {
    const [ana, bob] = await Promise.all([person("Ana Gómez"), person("Bob Ruiz")]);
    const notificationsOf = async (p: Person, query = "") => (await server.request(`/api/notifications${query}`, { token: p.token })).body as NotificationList;

    const sent = (await request(ana, { email: bob.email })).body as FriendRequestDto;
    const bobs = await notificationsOf(bob, "?unread=true");
    assert.equal(bobs.unread, 1);
    const [n] = bobs.items;
    assert.ok(n);
    assert.equal(n.kind, "FRIEND_REQUEST");
    assert.equal(n.friendRequestId, sent.id);
    assert.deepEqual(n.actor, { userId: ana.id, displayName: displayName(`${PREFIX}Ana Gómez`) });
    assert.equal(n.invite, null);
    assert.equal(n.readAt, null);
    assert.deepEqual(await notificationsOf(ana), { unread: 0, items: [] }, "the requester isn't told about their own request");

    // Read once, stays read; someone else's notification doesn't exist.
    const read = await server.request(`/api/notifications/${n.id}/read`, { method: "POST", token: bob.token });
    assert.equal(read.status, 200, read.text);
    assert.ok((read.body as NotificationDto).readAt);
    assert.equal((await notificationsOf(bob, "?unread=true")).unread, 0);
    assert.equal((await notificationsOf(bob)).items.length, 1);
    const foreign = await server.request(`/api/notifications/${n.id}/read`, { method: "POST", token: ana.token });
    assert.equal(foreign.status, 404);
    assert.equal(errorCode(foreign.body), "NOTIFICATION_NOT_FOUND");

    assert.equal((await cancel(bob, sent.id)).status, 204);
    assert.deepEqual(await notificationsOf(bob), { unread: 0, items: [] }, "withdrawn or rejected: nothing left to answer");
  });

  test("read-all clears every unread notification", async () => {
    const [ana, bob, carol] = await Promise.all([person(), person(), person()]);
    for (const from of [ana, bob]) assert.equal((await request(from, { email: carol.email })).status, 201);
    const before = (await server.request("/api/notifications", { token: carol.token })).body as NotificationList;
    assert.equal(before.unread, 2);
    const res = await server.request("/api/notifications/read-all", { method: "POST", token: carol.token });
    assert.deepEqual(res.body, { read: 2 });
    const after = (await server.request("/api/notifications", { token: carol.token })).body as NotificationList;
    assert.equal(after.unread, 0);
    assert.ok(after.items.every((n) => n.readAt !== null));
    assert.deepEqual((await server.request("/api/notifications/read-all", { method: "POST", token: carol.token })).body, { read: 0 });
  });

  test("deleting a user removes their friendships", async () => {
    const [ana, bob] = await Promise.all([person(), person()]);
    await befriend(ana, bob);
    await db.delete(users).where(eq(users.id, bob.id));
    assert.deepEqual(await friendsOf(ana), []);
  });
});
