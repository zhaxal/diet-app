import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/mcp/route";

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
  assert.equal(json.result.serverInfo.name, "diet-tracker");
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
});

