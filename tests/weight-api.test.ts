import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as listWeight, POST as logWeight } from "../app/api/weight/route";
import { createUser, request } from "./helpers";

test("a two-decimal reading comes back as it was entered, not rounded to one decimal", async () => {
  const user = await createUser("two-decimals@example.com");

  const res = await logWeight(request("POST", "/api/weight", { token: user.token, body: { weight: 72.45 } }));
  assert.equal(res.status, 201);
  const { log } = await res.json();
  assert.equal(log.weight, 72.45);
  assert.equal(log.weightKg, 72.45);

  const list = await (await listWeight(request("GET", "/api/weight", { token: user.token }))).json();
  assert.deepEqual(
    list.logs.map((l: { weight: number }) => l.weight),
    [72.45],
  );
});

test("a reading entered in pounds reads back in pounds without drift", async () => {
  const user = await createUser("pounds@example.com");
  await prisma.user.update({ where: { id: user.id }, data: { weightUnit: "lb" } });

  const res = await logWeight(request("POST", "/api/weight", { token: user.token, body: { weight: 160.25 } }));
  assert.equal(res.status, 201);
  const { log } = await res.json();
  assert.equal(log.weight, 160.25);
  assert.equal(log.enteredUnit, "lb");
});
