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

