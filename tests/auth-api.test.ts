import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as registrationStatus, POST as register } from "../app/api/auth/register/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as mcp } from "../app/api/mcp/route";
import { createUser, request } from "./helpers";

const PASSWORD = "correct-horse-battery";

/** Each test speaks from its own address so attempt counters cannot overlap. */
const from = (ip: string) => ({ "x-forwarded-for": ip });

const signUp = (body: Record<string, unknown>, ip = "192.0.2.1") =>
  register(request("POST", "/api/auth/register", { body, headers: from(ip) }));

const signIn = (email: string, password: string, ip: string) =>
  login(request("POST", "/api/auth/login", { body: { email, password }, headers: from(ip) }));

async function status() {
  const res = await registrationStatus();
  return (await res.json()) as { open: boolean; inviteRequired: boolean };
}

// ── Who may register ───────────────────────────────────────────────────────

test("the first account on a fresh server needs no invite", async () => {
  await prisma.user.deleteMany();
  delete process.env.INVITE_CODE;

  assert.deepEqual(await status(), { open: true, inviteRequired: false });
  const res = await signUp({ email: "owner@example.com", password: PASSWORD });
  assert.equal(res.status, 201);
  assert.equal(await prisma.user.count(), 1);
});

test("once an account exists, registration is closed unless an invite code is configured", async () => {
  delete process.env.INVITE_CODE;
  assert.ok((await prisma.user.count()) > 0);

  assert.deepEqual(await status(), { open: false, inviteRequired: false });
  const res = await signUp({ email: "stranger@example.com", password: PASSWORD });
  assert.equal(res.status, 403);
  assert.equal(await prisma.user.findUnique({ where: { email: "stranger@example.com" } }), null);
});

test("with an invite code configured, only someone who knows it can register", async (t) => {
  process.env.INVITE_CODE = "orchard-42";
  t.after(() => delete process.env.INVITE_CODE);

  assert.deepEqual(await status(), { open: true, inviteRequired: true });

  const missing = await signUp({ email: "friend@example.com", password: PASSWORD });
  assert.equal(missing.status, 403);
  const wrong = await signUp({ email: "friend@example.com", password: PASSWORD, inviteCode: "orchard-43" });
  assert.equal(wrong.status, 403);
  assert.equal(await prisma.user.findUnique({ where: { email: "friend@example.com" } }), null);

  const right = await signUp({ email: "friend@example.com", password: PASSWORD, inviteCode: "orchard-42" });
  assert.equal(right.status, 201);
  assert.notEqual(await prisma.user.findUnique({ where: { email: "friend@example.com" } }), null);
});

test("an empty invite code setting does not open registration to an empty code", async (t) => {
  process.env.INVITE_CODE = "";
  t.after(() => delete process.env.INVITE_CODE);

  assert.deepEqual(await status(), { open: false, inviteRequired: false });
  const res = await signUp({ email: "blank@example.com", password: PASSWORD, inviteCode: "" });
  assert.equal(res.status, 403);
});

test("repeated wrong invite codes from one address are cut off", async (t) => {
  process.env.INVITE_CODE = "orchard-42";
  t.after(() => delete process.env.INVITE_CODE);
  const ip = "192.0.2.50";

  for (let i = 0; i < 30; i++) {
    const res = await signUp({ email: "guess@example.com", password: PASSWORD, inviteCode: `guess-${i}` }, ip);
    assert.equal(res.status, 403);
  }
  // Even the right code is refused now, so guessing on cannot pay off.
  const res = await signUp({ email: "guess@example.com", password: PASSWORD, inviteCode: "orchard-42" }, ip);
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("retry-after")) > 0);
  assert.equal(await prisma.user.findUnique({ where: { email: "guess@example.com" } }), null);
});

// ── API keys ───────────────────────────────────────────────────────────────

test("a new account's API key is random hex, not a database id", async (t) => {
  process.env.INVITE_CODE = "orchard-42";
  t.after(() => delete process.env.INVITE_CODE);

  for (const email of ["key-a@example.com", "key-b@example.com"]) {
    const res = await signUp({ email, password: PASSWORD, inviteCode: "orchard-42" });
    assert.equal(res.status, 201);
  }
  const a = await prisma.user.findUniqueOrThrow({ where: { email: "key-a@example.com" } });
  const b = await prisma.user.findUniqueOrThrow({ where: { email: "key-b@example.com" } });
  assert.match(a.apiKey, /^[0-9a-f]{32}$/);
  assert.match(b.apiKey, /^[0-9a-f]{32}$/);
  assert.notEqual(a.apiKey, b.apiKey);
});

// ── Password guessing ──────────────────────────────────────────────────────

test("ten wrong passwords lock an address out of that account, even with the right one", async () => {
  await createUser("locked@example.com", { password: PASSWORD });
  const ip = "198.51.100.1";

  for (let i = 0; i < 10; i++) {
    const res = await signIn("locked@example.com", `wrong-password-${i}`, ip);
    assert.equal(res.status, 401);
  }
  const blocked = await signIn("locked@example.com", PASSWORD, ip);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.cookies.get("diet_token"), undefined);

  // The owner, arriving from somewhere else, is not locked out by it.
  const elsewhere = await signIn("locked@example.com", PASSWORD, "198.51.100.99");
  assert.equal(elsewhere.status, 200);
});

test("a successful login forgives the wrong attempts before it", async () => {
  await createUser("forgiven@example.com", { password: PASSWORD });
  const ip = "198.51.100.2";

  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 9; i++) {
      assert.equal((await signIn("forgiven@example.com", "wrong-password", ip)).status, 401);
    }
    assert.equal((await signIn("forgiven@example.com", PASSWORD, ip)).status, 200);
  }
});

test("an unknown email takes about as long to reject as a wrong password", async () => {
  await createUser("timing@example.com", { password: PASSWORD });
  const ip = "198.51.100.3";

  const time = async (email: string) => {
    const start = performance.now();
    const res = await signIn(email, "wrong-password", ip);
    assert.equal(res.status, 401);
    return performance.now() - start;
  };
  await time("timing@example.com"); // warm up the hashing code path
  const known = await time("timing@example.com");
  const unknown = await time("nobody@example.com");
  // Without a password check for unknown emails this ratio is about 0.02,
  // which tells a caller which addresses have accounts.
  assert.ok(unknown > known * 0.3, `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`);
});

// ── API key guessing ───────────────────────────────────────────────────────

test("repeated wrong API keys from one address are cut off", async () => {
  const user = await createUser("connector@example.com");
  const { apiKey } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const call = (key: string, ip: string) =>
    mcp(
      request("POST", `/api/mcp?key=${key}`, {
        headers: from(ip),
        body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_weight", arguments: {} } },
      }),
    );
  const ip = "203.0.113.5";

  for (let i = 0; i < 30; i++) {
    const res = await call(`not-the-key-${i}`, ip);
    assert.equal((await res.json()).error.code, -32001);
  }
  const blocked = await call(apiKey, ip);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);

  // The real connector, on its own address, keeps working.
  const ok = await call(apiKey, "203.0.113.99");
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).error, undefined);
});
