import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as listEntries, POST as createEntry } from "../app/api/entries/route";
import {
  GET as getEntry,
  PATCH as patchEntry,
  DELETE as deleteEntry,
} from "../app/api/entries/[id]/route";
import { POST as copyDay } from "../app/api/entries/copy/route";
import { GET as getSummary } from "../app/api/summary/route";
import { GET as getTrends } from "../app/api/trends/route";
import { GET as listProducts, POST as createProduct } from "../app/api/products/route";
import { PATCH as patchProduct, DELETE as deleteProduct } from "../app/api/products/[id]/route";
import { GET as listWeight, POST as logWeight } from "../app/api/weight/route";
import { GET as exportAll } from "../app/api/export/route";
import { createUser, request, withId } from "./helpers";

const porridge = { name: "Porridge", calories: 300, protein: 20, mealType: "breakfast" };

async function addEntry(token: string, body: Record<string, unknown>) {
  const res = await createEntry(request("POST", "/api/entries", { token, body }));
  assert.equal(res.status, 201);
  return (await res.json()).entry as { id: string } & Record<string, unknown>;
}

test("the food API refuses a caller who is not signed in", async () => {
  const res = await createEntry(request("POST", "/api/entries", { body: porridge }));
  assert.equal(res.status, 401);
  assert.equal(await prisma.foodEntry.count({ where: { name: "Porridge" } }), 0);
});

test("an entry created over REST is stamped as written by the UI door", async () => {
  const user = await createUser("stamp@example.com");
  const entry = await addEntry(user.token, porridge);
  assert.equal(entry.source, "ui");
  assert.equal(entry.userId, user.id);
  assert.equal(entry.calories, 300);
});

test("the deprecated quantityGrams field is stored as a quantity in grams", async () => {
  const user = await createUser("legacy@example.com");
  const entry = await addEntry(user.token, { ...porridge, quantityGrams: 150 });
  assert.equal(entry.quantity, 150);
  assert.equal(entry.quantityUnit, "g");
});

test("an entry without a name or with fractional calories is rejected", async () => {
  const user = await createUser("invalid@example.com");
  const noName = await createEntry(
    request("POST", "/api/entries", { token: user.token, body: { calories: 100, mealType: "lunch" } }),
  );
  assert.equal(noName.status, 422);

  const fractional = await createEntry(
    request("POST", "/api/entries", {
      token: user.token,
      body: { name: "Toast", calories: 99.5, mealType: "lunch" },
    }),
  );
  assert.equal(fractional.status, 422);
  assert.equal(await prisma.foodEntry.count({ where: { userId: user.id } }), 0);
});

test("listing a date returns the entries of that local day, not the UTC day", async () => {
  // Tokyo is UTC+9: 15:00Z on the 15th is midnight on the 16th.
  const user = await createUser("tokyo@example.com", { timezone: "Asia/Tokyo" });
  await addEntry(user.token, { ...porridge, name: "Late snack", consumedAt: "2026-11-15T14:59:00.000Z" });
  await addEntry(user.token, { ...porridge, name: "Midnight rice", consumedAt: "2026-11-15T15:00:00.000Z" });

  const res = await listEntries(request("GET", "/api/entries?date=2026-11-16", { token: user.token }));
  const { entries } = (await res.json()) as { entries: { name: string }[] };
  assert.deepEqual(entries.map((e) => e.name), ["Midnight rice"]);
});

test("a malformed date filter is rejected rather than ignored", async () => {
  const user = await createUser("baddate@example.com");
  const res = await listEntries(request("GET", "/api/entries?date=16-11-2026", { token: user.token }));
  assert.equal(res.status, 422);
});

test("one account cannot read, change or delete another account's entry", async () => {
  const owner = await createUser("owner@example.com");
  const intruder = await createUser("intruder@example.com");
  const entry = await addEntry(owner.token, porridge);
  const path = `/api/entries/${entry.id}`;

  const read = await getEntry(request("GET", path, { token: intruder.token }), withId(entry.id));
  assert.equal(read.status, 404);

  const patch = await patchEntry(
    request("PATCH", path, { token: intruder.token, body: { calories: 1 } }),
    withId(entry.id),
  );
  assert.equal(patch.status, 404);

  const del = await deleteEntry(request("DELETE", path, { token: intruder.token }), withId(entry.id));
  assert.equal(del.status, 404);

  const stored = await prisma.foodEntry.findUnique({ where: { id: entry.id } });
  assert.equal(stored?.calories, 300);
});

test("the owner can correct an entry, and an empty correction is refused", async () => {
  const user = await createUser("editor@example.com");
  const entry = await addEntry(user.token, porridge);
  const path = `/api/entries/${entry.id}`;

  const empty = await patchEntry(request("PATCH", path, { token: user.token, body: {} }), withId(entry.id));
  assert.equal(empty.status, 422);

  const res = await patchEntry(
    request("PATCH", path, { token: user.token, body: { calories: 320, mealType: "snack" } }),
    withId(entry.id),
  );
  assert.equal(res.status, 200);
  const stored = await prisma.foodEntry.findUnique({ where: { id: entry.id } });
  assert.equal(stored?.calories, 320);
  assert.equal(stored?.mealType, "snack");
  assert.equal(stored?.name, "Porridge");
});

test("the owner can delete an entry", async () => {
  const user = await createUser("deleter@example.com");
  const entry = await addEntry(user.token, porridge);
  const res = await deleteEntry(
    request("DELETE", `/api/entries/${entry.id}`, { token: user.token }),
    withId(entry.id),
  );
  assert.equal(res.status, 200);
  assert.equal(await prisma.foodEntry.findUnique({ where: { id: entry.id } }), null);
});

test("the day summary totals the account's own entries per meal", async () => {
  const user = await createUser("summary@example.com");
  const other = await createUser("summary-other@example.com");
  const at = "2026-11-10T12:00:00.000Z";
  await addEntry(user.token, { ...porridge, consumedAt: at });
  await addEntry(user.token, {
    name: "Curry", calories: 500, protein: 30, carbs: 60, sodium: 900, mealType: "dinner", consumedAt: at,
  });
  // Someone else's food on the same day must not be counted.
  await addEntry(other.token, { name: "Cake", calories: 999, mealType: "snack", consumedAt: at });

  const res = await getSummary(request("GET", "/api/summary?date=2026-11-10", { token: user.token }));
  const body = await res.json();
  assert.equal(body.date, "2026-11-10");
  assert.equal(body.total.calories, 800);
  assert.equal(body.total.protein, 50);
  assert.equal(body.total.carbs, 60);
  assert.equal(body.total.sodium, 900);
  assert.equal(body.total.count, 2);
  assert.equal(body.byMeal.breakfast.calories, 300);
  assert.equal(body.byMeal.dinner.calories, 500);
  assert.equal(body.byMeal.lunch.count, 0);
  assert.equal(body.byMeal.snack.calories, 0);
});

test("trends report every day in the window, including days with nothing logged", async () => {
  const user = await createUser("trends@example.com", { timezone: "Asia/Tokyo" });
  await addEntry(user.token, { ...porridge, consumedAt: "2026-11-10T01:00:00.000Z" }); // 10:00 on the 10th
  await addEntry(user.token, {
    name: "Ramen", calories: 700, mealType: "dinner", consumedAt: "2026-11-12T10:00:00.000Z", // 19:00 on the 12th
  });
  await prisma.weightLog.createMany({
    data: [
      { userId: user.id, weight: 80.4, loggedAt: new Date("2026-11-10T00:00:00.000Z") }, // 09:00
      { userId: user.id, weight: 80.1, loggedAt: new Date("2026-11-10T12:00:00.000Z") }, // 21:00, same day
    ],
  });

  const res = await getTrends(
    request("GET", "/api/trends?from=2026-11-10&to=2026-11-12", { token: user.token }),
  );
  const body = await res.json();
  assert.equal(body.days, 3);
  assert.deepEqual(
    body.nutrition.map((d: { date: string; calories: number; count: number }) => [d.date, d.calories, d.count]),
    [
      ["2026-11-10", 300, 1],
      ["2026-11-11", 0, 0],
      ["2026-11-12", 700, 1],
    ],
  );
  // The last reading of a day stands for that day.
  assert.deepEqual(body.weight, [{ date: "2026-11-10", value: 80.1 }]);
  assert.equal(body.meals.breakfast.calories, 300);
  assert.equal(body.meals.dinner.calories, 700);
});

test("a trends window that ends before it starts is rejected", async () => {
  const user = await createUser("trends-bad@example.com");
  const res = await getTrends(
    request("GET", "/api/trends?from=2026-11-12&to=2026-11-10", { token: user.token }),
  );
  assert.equal(res.status, 422);
});

test("copying a day keeps each entry's time of day and where it came from", async () => {
  const user = await createUser("copy@example.com", { timezone: "Asia/Tokyo" });
  // 08:12 on the 10th in Tokyo.
  await addEntry(user.token, {
    ...porridge, quantity: 2, quantityUnit: "serving", consumedAt: "2026-11-09T23:12:00.000Z",
  });

  const res = await copyDay(
    request("POST", "/api/entries/copy", { token: user.token, body: { from: "2026-11-10", to: "2026-11-12" } }),
  );
  assert.deepEqual(await res.json(), { copied: 1 });

  const copies = await prisma.foodEntry.findMany({
    where: { userId: user.id, consumedAt: { gte: new Date("2026-11-11T15:00:00.000Z") } },
  });
  assert.equal(copies.length, 1);
  // 08:12 on the 12th in Tokyo.
  assert.equal(copies[0].consumedAt.toISOString(), "2026-11-11T23:12:00.000Z");
  assert.equal(copies[0].quantity, 2);
  assert.equal(copies[0].quantityUnit, "serving");
});

test("a day cannot be copied onto itself", async () => {
  const user = await createUser("copy-self@example.com");
  await addEntry(user.token, { ...porridge, consumedAt: "2026-11-10T12:00:00.000Z" });
  const res = await copyDay(
    request("POST", "/api/entries/copy", { token: user.token, body: { from: "2026-11-10", to: "2026-11-10" } }),
  );
  assert.equal(res.status, 400);
  assert.equal(await prisma.foodEntry.count({ where: { userId: user.id } }), 1);
});

test("products reject empty numeric strings and serving/basis mismatches, normalize barcodes, and detect P2002", async () => {
  const user = await createUser("prod-val@example.com");

  const blankCal = await createProduct(
    request("POST", "/api/products", {
      token: user.token,
      body: { name: "Water", calories: "", basis: "100g" },
    }),
  );
  assert.equal(blankCal.status, 422);

  const badBasis = await createProduct(
    request("POST", "/api/products", {
      token: user.token,
      body: {
        name: "Olive Oil",
        calories: 884,
        basis: "100g",
        servingSize: 15,
        servingUnit: "ml",
      },
    }),
  );
  assert.equal(badBasis.status, 422);

  const p1Res = await createProduct(
    request("POST", "/api/products", {
      token: user.token,
      body: { name: "Oats", calories: 380, basis: "100g", barcode: "   " },
    }),
  );
  assert.equal(p1Res.status, 201);
  const { product: p1 } = (await p1Res.json()) as { product: { id: string; barcode: string | null } };
  assert.equal(p1.barcode, null);

  const p2Res = await createProduct(
    request("POST", "/api/products", {
      token: user.token,
      body: { name: "Milk", calories: 42, basis: "100ml", barcode: "123456" },
    }),
  );
  assert.equal(p2Res.status, 201);

  // Patching p1 to collide with p2's barcode triggers 409
  const dupPatch = await patchProduct(
    request("PATCH", `/api/products/${p1.id}`, {
      token: user.token,
      body: { barcode: "123456" },
    }),
    withId(p1.id),
  );
  assert.equal(dupPatch.status, 409);

  // Patching incompatible serving unit fails with 422
  const badPatch = await patchProduct(
    request("PATCH", `/api/products/${p1.id}`, {
      token: user.token,
      body: { servingSize: 30, servingUnit: "ml" },
    }),
    withId(p1.id),
  );
  assert.equal(badPatch.status, 422);

  // Empty barcode clears to null
  const clearBarcode = await patchProduct(
    request("PATCH", `/api/products/${p1.id}`, {
      token: user.token,
      body: { barcode: "" },
    }),
    withId(p1.id),
  );
  assert.equal(clearBarcode.status, 200);
  assert.equal((await clearBarcode.json()).product.barcode, null);

  const listRes = await listProducts(request("GET", "/api/products?q=Oat", { token: user.token }));
  assert.equal((await listRes.json()).products.length, 1);

  // Another user gets 404 deleting p1
  const other = await createUser("prod-other@example.com");
  const badDel = await deleteProduct(
    request("DELETE", `/api/products/${p1.id}`, { token: other.token }),
    withId(p1.id),
  );
  assert.equal(badDel.status, 404);
});

test("entries reject foreign productId and clear quantityUnit when quantity becomes null", async () => {
  const owner = await createUser("entry-prod-owner@example.com");
  const caller = await createUser("entry-prod-caller@example.com");
  const pRes = await createProduct(
    request("POST", "/api/products", {
      token: owner.token,
      body: { name: "Secret Yogurt", calories: 60, basis: "100g" },
    }),
  );
  const { product } = (await pRes.json()) as { product: { id: string } };

  const badCreate = await createEntry(
    request("POST", "/api/entries", {
      token: caller.token,
      body: { ...porridge, productId: product.id },
    }),
  );
  assert.equal(badCreate.status, 422);

  const ownEntry = await addEntry(caller.token, {
    ...porridge,
    quantity: 100,
    quantityUnit: "g",
  });
  const cleared = await patchEntry(
    request("PATCH", `/api/entries/${ownEntry.id}`, {
      token: caller.token,
      body: { quantity: null },
    }),
    withId(ownEntry.id),
  );
  assert.equal(cleared.status, 200);
  const updated = (await cleared.json()).entry;
  assert.equal(updated.quantity, null);
  assert.equal(updated.quantityUnit, null);
});

test("weight date validation, trends lb conversion + days=all, and CSV formula escaping", async () => {
  const user = await createUser("trends-lb@example.com");
  await prisma.user.update({ where: { id: user.id }, data: { weightUnit: "lb" } });

  const badWeight = await listWeight(
    request("GET", "/api/weight?from=2026-02-30", { token: user.token }),
  );
  assert.equal(badWeight.status, 422);

  const logRes = await logWeight(
    request("POST", "/api/weight", {
      token: user.token,
      body: { weight: 220, unit: "lb", loggedAt: "2026-10-01T12:00:00.000Z" },
    }),
  );
  assert.equal(logRes.status, 201);

  const trendsRes = await getTrends(
    request("GET", "/api/trends?days=all", { token: user.token }),
  );
  assert.equal(trendsRes.status, 200);
  const trendsJson = await trendsRes.json();
  assert.ok(trendsJson.weight.length === 1);
  assert.ok(Math.abs(trendsJson.weight[0].value - 220) < 0.2);

  // Formula-injection entry name should be quoted and prefixed with '
  await addEntry(user.token, {
    ...porridge,
    name: "=SUM(A1:A2)",
    consumedAt: "2026-10-01T12:00:00.000Z",
  });
  const csvRes = await exportAll(
    request("GET", "/api/export?format=csv", { token: user.token }),
  );
  assert.equal(csvRes.status, 200);
  const csv = await csvRes.text();
  assert.ok(csv.includes("'=SUM(A1:A2)"));
});
