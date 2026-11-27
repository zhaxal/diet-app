import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/mcp/route";
import { prisma } from "../lib/prisma";

async function callTool(apiKey: string, name: string, args: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost:3000/api/mcp?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  return json.result.content[0].text as string;
}

test("MCP initialize returns capabilities for tools and resources, plus instructions", async () => {
  const req = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  assert.equal(json.result.serverInfo.name, "rationd");
  assert.deepEqual(json.result.capabilities, { tools: {}, resources: {} });
  assert.ok(typeof json.result.instructions === "string");
  assert.ok(json.result.instructions.includes("save_product"));
  assert.ok(json.result.instructions.includes("lookup_barcode"));
  assert.ok(json.result.instructions.includes("diet://today/summary"));
});

test("MCP initialize advertises same-origin icons, honouring a TLS proxy", async () => {
  const init = async (headers: Record<string, string>) => {
    const req = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25" },
      }),
    });
    const res = await POST(req);
    return (await res.json()).result.serverInfo.icons as Array<{
      src: string;
      mimeType: string;
      sizes: string[];
    }>;
  };

  const icons = await init({});
  assert.ok(icons.length > 0);
  for (const icon of icons) {
    assert.ok(icon.src.startsWith("http://localhost:3000/"), icon.src);
    assert.ok(icon.mimeType.startsWith("image/"));
    assert.ok(Array.isArray(icon.sizes) && icon.sizes.length > 0);
  }
  assert.ok(icons.some((i) => i.mimeType === "image/png"));

  // Behind a proxy the request arrives as plain http on an internal host; the
  // icon URL has to name the public https origin or the client drops it.
  const proxied = await init({
    "x-forwarded-proto": "https",
    "x-forwarded-host": "food.example.com",
  });
  for (const icon of proxied) {
    assert.ok(icon.src.startsWith("https://food.example.com/"), icon.src);
  }
});

test("MCP tools/list returns lookup_barcode and other essential tools", async () => {
  const req = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  const toolNames = json.result.tools.map((t: { name: string }) => t.name);
  assert.ok(toolNames.includes("lookup_barcode"));
  assert.ok(toolNames.includes("save_product"));
  assert.ok(toolNames.includes("log_meal"));
  assert.ok(toolNames.includes("search_products"));
  assert.ok(toolNames.includes("get_summary"));
});

test("MCP resources/list returns standard live resources", async () => {
  const req = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/list",
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  const uris = json.result.resources.map((r: { uri: string }) => r.uri);
  assert.ok(uris.includes("diet://today/summary"));
  assert.ok(uris.includes("diet://today/entries"));
  assert.ok(uris.includes("diet://catalog/products"));
  assert.ok(uris.includes("diet://user/goals"));
  assert.ok(uris.includes("diet://weight/recent"));
});

test("MCP tools/list includes log_meal_items with items schema", async () => {
  const req = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  const logMealItems = json.result.tools.find((t: { name: string }) => t.name === "log_meal_items");
  assert.ok(logMealItems);
  assert.deepEqual(logMealItems.inputSchema.required, ["mealType", "items"]);
  assert.equal(logMealItems.inputSchema.properties.items.type, "array");
});

test("MCP tools/list includes workout tracking and gym tools", async () => {
  const req = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
    }),
  });
  const res = await POST(req);
  const json = await res.json();
  const toolNames = json.result.tools.map((t: { name: string }) => t.name);
  assert.ok(toolNames.includes("log_workout"));
  assert.ok(toolNames.includes("get_workout"));
  assert.ok(toolNames.includes("get_exercise_history"));
  assert.ok(toolNames.includes("suggest_next_workout"));
  assert.ok(toolNames.includes("import_workouts"));
  assert.ok(toolNames.includes("export_workouts"));
  assert.ok(toolNames.includes("get_workout_summary"));
});

test("get_workout returns performance vs. the previous session, as its description promises", async () => {
  const user = await prisma.user.upsert({
    where: { email: "test-mcp-workout@example.com" },
    update: {},
    create: {
      email: "test-mcp-workout@example.com",
      passwordHash: "dummy",
      weightUnit: "kg",
    },
  });
  await prisma.workout.deleteMany({ where: { userId: user.id } });
  await prisma.exercise.deleteMany({ where: { userId: user.id } });

  await callTool(user.apiKey, "log_workout", {
    date: "2026-09-01",
    note: "Bench Press\n- 80kg x 8\n- 80kg x 8\n",
  });
  await callTool(user.apiKey, "log_workout", {
    date: "2026-09-08",
    note: "Bench Press\n- 85kg x 6 // felt strong\n",
  });

  const result = await callTool(user.apiKey, "get_workout", { date: "2026-09-08" });
  assert.match(result, /Performance vs\. previous session/);
  assert.match(result, /Bench Press — previous: 80kg × 8, 8 \(2026-09-01\)/);

  await prisma.workout.deleteMany({ where: { userId: user.id } });
  await prisma.exercise.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

test("MCP rejects malformed JSON-RPC envelopes with -32600 and CORS headers", async () => {
  for (const payload of [null, [], {}]) {
    const req = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const json = await res.json();
    assert.equal(json.error.code, -32600);
  }
});

test("MCP handles ping, rejects prototype tool names cleanly, and rejects empty ?key=", async () => {
  const pingReq = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "ping" }),
  });
  const pingRes = await POST(pingReq);
  assert.equal(pingRes.status, 200);
  assert.deepEqual((await pingRes.json()).result, {});

  const user = await prisma.user.upsert({
    where: { email: "test-mcp-edge@example.com" },
    update: {},
    create: {
      email: "test-mcp-edge@example.com",
      passwordHash: "dummy",
      weightUnit: "lb",
      dailyCalories: 0,
    },
  });

  // Empty ?key= must not pass auth
  const emptyKeyReq = new NextRequest("http://localhost:3000/api/mcp?key=", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "get_summary", arguments: {} },
    }),
  });
  const emptyKeyRes = await POST(emptyKeyReq);
  assert.equal(emptyKeyRes.status, 200);
  const emptyKeyJson = await emptyKeyRes.json();
  assert.equal(emptyKeyJson.error.code, -32001);

  // Prototype-key tool name must return an MCP tool error instead of reading Object.prototype
  for (const protoName of ["toString", "constructor"]) {
    const protoReq = new NextRequest(`http://localhost:3000/api/mcp?key=${user.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: protoName, arguments: {} },
      }),
    });
    const protoRes = await POST(protoReq);
    const protoJson = await protoRes.json();
    assert.equal(protoJson.result?.isError, true);
    assert.match(protoJson.result?.content?.[0]?.text ?? "", /Unknown tool/i);
  }

  // Atomic log_meal_items rolls back all items if one fails validation/constraints
  const badBatchReq = new NextRequest(`http://localhost:3000/api/mcp?key=${user.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "log_meal_items",
        arguments: {
          mealType: "lunch",
          items: [
            { name: "Valid Apple", calories: 95 },
            { name: "Bad Item", calories: -5 },
          ],
        },
      },
    }),
  });
  const badBatchRes = await POST(badBatchReq);
  const badBatchJson = await badBatchRes.json();
  assert.equal(badBatchJson.result?.isError, true);
  assert.equal(await prisma.foodEntry.count({ where: { userId: user.id } }), 0);

  // get_summary handles dailyCalories: 0 properly
  const summaryText = await callTool(user.apiKey, "get_summary", {});
  assert.match(summaryText, /0\s*kcal|goal/i);

  // diet://weight/recent converts canonical kg reading to lb
  await prisma.weightLog.create({
    data: {
      userId: user.id,
      weight: 80,
      unit: "kg",
      loggedAt: new Date(),
    },
  });
  const readReq = new NextRequest(`http://localhost:3000/api/mcp?key=${user.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 14,
      method: "resources/read",
      params: { uri: "diet://weight/recent" },
    }),
  });
  const readRes = await POST(readReq);
  const readJson = await readRes.json();
  const payload = JSON.parse(readJson.result.contents[0].text) as {
    unit: string;
    logs: Array<{ weight: number; weightKg: number }>;
  };
  assert.equal(payload.unit, "lb");
  assert.equal(payload.logs.length, 1);
  assert.equal(payload.logs[0].weightKg, 80);
  assert.ok(payload.logs[0].weight > 176 && payload.logs[0].weight < 177);

  await prisma.weightLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

