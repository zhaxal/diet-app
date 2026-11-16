import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { POST as changePassword } from "../app/api/auth/password/route";
import { POST as login } from "../app/api/auth/login/route";
import { GET as me } from "../app/api/auth/me/route";
import { POST as mcp } from "../app/api/mcp/route";
import { createUser, request } from "./helpers";

const OLD = "correct-horse-battery";
const NEW = "staple-gun-orchard-9";

/** Each test speaks from its own address so attempt counters cannot overlap. */
const from = (ip: string) => ({ "x-forwarded-for": ip });

const change = (token: string | undefined, body: Record<string, unknown>, ip = "192.0.2.10") =>
  changePassword(request("POST", "/api/auth/password", { token, body, headers: from(ip) }));

const signIn = async (email: string, password: string, ip = "192.0.2.20") =>
  (await login(request("POST", "/api/auth/login", { body: { email, password }, headers: from(ip) }))).status;

const whoAmI = async (token: string) => (await me(request("GET", "/api/auth/me", { token }))).status;

test("changing a password requires being signed in", async () => {
  const res = await change(undefined, { currentPassword: OLD, newPassword: NEW });
  assert.equal(res.status, 401);
});

test("the current password must be right, or nothing changes", async () => {
  const user = await createUser("wrong-current@example.com", { password: OLD });
  const res = await change(user.token, { currentPassword: "not-my-password", newPassword: NEW });
  assert.equal(res.status, 403);
  assert.equal(await signIn(user.email, OLD), 200);
  assert.equal(await signIn(user.email, NEW), 401);
  // The session that asked is still good, too.
  assert.equal(await whoAmI(user.token), 200);
});

test("after a change the new password signs in and the old one does not", async () => {
  const user = await createUser("changed@example.com", { password: OLD });
  const res = await change(user.token, { currentPassword: OLD, newPassword: NEW });
  assert.equal(res.status, 200);
  assert.equal(await signIn(user.email, NEW), 200);
  assert.equal(await signIn(user.email, OLD), 401);
});

test("a change signs out every earlier session and hands back a fresh one", async () => {
  const user = await createUser("sessions@example.com", { password: OLD });
  const otherDevice = user.token;
  assert.equal(await whoAmI(otherDevice), 200);

  const res = await change(user.token, { currentPassword: OLD, newPassword: NEW });
  const body = (await res.json()) as { token: string };

  assert.equal(await whoAmI(otherDevice), 401);
  assert.equal(await whoAmI(body.token), 200);
  // The browser that made the change stays signed in through its cookie.
  assert.equal(res.cookies.get("diet_token")?.value, body.token);
});

test("signing in again after a change gives a session that works", async () => {
  const user = await createUser("relogin@example.com", { password: OLD });
  await change(user.token, { currentPassword: OLD, newPassword: NEW });

  const res = await login(
    request("POST", "/api/auth/login", {
      body: { email: user.email, password: NEW },
      headers: from("192.0.2.30"),
    }),
  );
  const { token } = (await res.json()) as { token: string };
  assert.equal(await whoAmI(token), 200);
});

test("a session from before sessions carried a version keeps working", async () => {
  const user = await createUser("legacy-session@example.com", { password: OLD });
  // The shape of every token issued before this feature: no version claim.
  const legacy = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET as string, {
    expiresIn: "30d",
  });
  assert.equal(await whoAmI(legacy), 200);

  await change(user.token, { currentPassword: OLD, newPassword: NEW });
  assert.equal(await whoAmI(legacy), 401);
});

test("a new password that is too short or unchanged is refused", async () => {
  const user = await createUser("weak@example.com", { password: OLD });
  const short = await change(user.token, { currentPassword: OLD, newPassword: "short" });
  assert.equal(short.status, 422);
  const same = await change(user.token, { currentPassword: OLD, newPassword: OLD });
  assert.equal(same.status, 422);
  assert.equal(await signIn(user.email, OLD), 200);
  assert.equal(await whoAmI(user.token), 200);
});

test("the assistant's API key keeps working after a password change", async () => {
  const user = await createUser("assistant@example.com", { password: OLD });
  const { apiKey } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await change(user.token, { currentPassword: OLD, newPassword: NEW });

  const res = await mcp(
    request("POST", `/api/mcp?key=${apiKey}`, {
      body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_weight", arguments: {} } },
    }),
  );
  assert.equal((await res.json()).error, undefined);
});

test("repeated wrong current passwords are cut off", async () => {
  const user = await createUser("guessing@example.com", { password: OLD });
  const ip = "192.0.2.77";
  for (let i = 0; i < 10; i++) {
    const res = await change(user.token, { currentPassword: `guess-${i}`, newPassword: NEW }, ip);
    assert.equal(res.status, 403);
  }
  const blocked = await change(user.token, { currentPassword: OLD, newPassword: NEW }, ip);
  assert.equal(blocked.status, 429);
  assert.equal(await signIn(user.email, OLD), 200);
});
