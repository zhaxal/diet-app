import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientFailures, clientIp } from "@/lib/rate-limit";
import { resolvePublicOrigin } from "@/lib/origin";
import { ResourceError, ToolError } from "@/lib/mcp/errors";
import { TOOLS } from "@/lib/mcp/schemas";
import { callTool, type McpUser } from "@/lib/mcp/tools";
import { readResource, RESOURCES } from "@/lib/mcp/resources";

const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonRpcEnvelopeSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    },
    { status, headers: CORS },
  );
}

function serverIcons(req: NextRequest) {
  const origin = resolvePublicOrigin(req);
  return [
    { src: `${origin}/icon-192.png`, mimeType: "image/png", sizes: ["192x192"] },
    { src: `${origin}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
    { src: `${origin}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  ];
}

const INSTRUCTIONS = `rationd MCP Server — Instructions for AI Assistants:

1. AUTOMATICALLY SAVE SCANNED NUTRITION TABLES & LABELS:
- Whenever the user photos, shares, or provides a nutrition facts table or product label:
  -> ALWAYS call 'save_product' to save it to their permanent catalog first!
  -> Provide the values per 100g or 100ml basis. Include barcode, brand, and serving size whenever visible.
  -> Do NOT just log a one-off meal entry. Saving the product ensures it is permanently saved in the user's library and available across all devices.
  -> After saving, if the user consumed a portion, call 'log_meal' with the returned 'productId' and the quantity eaten.

2. BARCODE SCANNING & LOOKUP:
- When a barcode is visible in a photo or provided as digits:
  -> Call 'lookup_barcode' immediately.
  -> If found on Open Food Facts, 'lookup_barcode' automatically saves the product into the user's catalog and returns its productId.
  -> If the barcode is not found on Open Food Facts, read the nutrition table from the photo/user and call 'save_product' including the 'barcode' field.

3. LOGGING MEALS:
- For MULTI-ITEM MEALS (full plate, combo, multiple dishes, e.g. 150g chicken breast + 200g rice + 10g olive oil):
  -> ALWAYS call 'log_meal_items' to log all items in ONE tool call!
- For single items, call 'log_meal'.
- Whenever possible, log using 'productId' + 'quantity' + 'unit' (e.g. quantity: 150, unit: "g") with 'mealType'. The server calculates the exact macros automatically from the saved product.
- If logging homemade, restaurant, or unpackaged food without a product label, provide 'name', 'calories', and estimated macros directly.

4. USER FEEDBACK:
- After saving a product and/or logging, give the user a clear, friendly confirmation stating:
  a) The product name and that it was saved to their permanent catalog.
  b) The meal type, quantity eaten, and resulting calories + macros.

5. REAL-TIME CONTEXT RESOURCES:
- You have direct read access to real-time diet resources:
  • diet://today/summary — today's calories, macros, goals, and remaining budget
  • diet://today/entries — all meals and items logged today
  • diet://catalog/products — the user's permanent catalog of saved products
  • diet://user/goals — daily targets (calories, protein, carbs, fat, fiber, etc.)
  • diet://weight/recent — body weight logs from the last 30 days

6. LOGGING WORKOUTS (GYM):
- Use 'log_workout' for a single day's session: an exercise name on its own line, then '- weight x reps' set lines (see that tool's schema for the full syntax — warmup, RPE, bodyweight, comma shorthand, and '// comment' for freeform notes like previous weight/reps).
- For bulk history (an Obsidian vault export, a multi-day training journal), use 'import_workouts' instead of many separate log_workout calls — call it once with dryRun: true to preview before committing.
- Before drafting a new session for a routine the user has done before, call 'suggest_next_workout' (progressive-overload draft) or 'get_exercise_history' (lifetime bests + recent sessions) rather than guessing at weights.
- 'get_workout' returns the day's log plus each exercise's performance vs. its previous session. 'get_workout_summary' answers broader questions (total volume, session frequency, muscle group distribution) over a timeframe.`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const envelope = jsonRpcEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    const rawId =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) && "id" in rawBody
        ? (rawBody as { id?: unknown }).id
        : null;
    return rpcError(rawId ?? null, -32600, "Invalid Request");
  }

  const { method, params, id } = envelope.data;

  // Notifications are fire-and-forget — no response body required.
  if (method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  if (method === "ping") {
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: {} }, { headers: CORS });
  }

  // initialize, tools/list, and resources/list need no auth so MCP clients can
  // inspect capabilities before the user configures credentials.
  if (method === "initialize") {
    const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
    const negotiated = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : SUPPORTED_PROTOCOL_VERSIONS[0];
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: {}, resources: {} },
          serverInfo: {
            name: "rationd",
            version: "1.0.0",
            icons: serverIcons(req),
          },
          instructions: INSTRUCTIONS,
        },
      },
      { headers: CORS },
    );
  }

  if (method === "tools/list") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: id ?? null, result: { tools: TOOLS } },
      { headers: CORS },
    );
  }

  if (method === "resources/list") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: id ?? null, result: { resources: RESOURCES } },
      { headers: CORS },
    );
  }

  if (method === "tools/call" || method === "resources/read") {
    const ipKey = `ip:${clientIp(req)}`;
    const limit = clientFailures.check(ipKey);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32001, message: "Too many failed attempts — try again later" },
        },
        { status: 429, headers: { ...CORS, "Retry-After": String(limit.retryAfterSec) } },
      );
    }

    const keyFromQuery = req.nextUrl.searchParams.get("key")?.trim();
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const rawKey = keyFromQuery || bearerToken || null;

    let authedUser: McpUser | null = null;
    if (rawKey) {
      authedUser = await prisma.user.findUnique({
        where: { apiKey: rawKey },
        select: { id: true, timezone: true, weightUnit: true },
      });
    }

    if (!authedUser) {
      if (rawKey) clientFailures.hit(ipKey);
      return rpcError(
        id,
        -32001,
        "Unauthorized — use the connector URL from your dashboard (it includes your key)",
      );
    }

    if (method === "resources/read") {
      const uri = typeof params?.uri === "string" ? params.uri : "";
      if (!uri) {
        return rpcError(id, -32602, "Missing uri parameter for resources/read");
      }
      try {
        const content = await readResource(uri, authedUser);
        return NextResponse.json(
          { jsonrpc: "2.0", id: id ?? null, result: { contents: [content] } },
          { headers: CORS },
        );
      } catch (e) {
        if (e instanceof ResourceError) {
          return rpcError(id, -32002, e.message);
        }
        console.error("MCP resources/read error:", e);
        return rpcError(id, -32002, "Resource read failed");
      }
    }

    const toolName = typeof params?.name === "string" ? params.name : "";
    if (!toolName) {
      return rpcError(id, -32602, "Missing tool name for tools/call");
    }
    const rawArgs =
      params?.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

    try {
      const text = await callTool(toolName, rawArgs, authedUser);
      return NextResponse.json(
        { jsonrpc: "2.0", id: id ?? null, result: { content: [{ type: "text", text }] } },
        { headers: CORS },
      );
    } catch (e) {
      const safeMessage = e instanceof ToolError ? e.message : "Tool execution failed";
      if (!(e instanceof ToolError)) {
        console.error(`MCP tools/call (${toolName}) error:`, e);
      }
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            content: [{ type: "text", text: safeMessage }],
            isError: true,
          },
        },
        { headers: CORS },
      );
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function GET() {
  return NextResponse.json(
    {
      name: "rationd",
      version: "1.0.0",
      protocol: `MCP ${SUPPORTED_PROTOCOL_VERSIONS[0]}`,
      description: "rationd MCP Server for AI assistants (Claude, Cursor, Windsurf, ChatGPT, etc.)",
    },
    { headers: CORS },
  );
}
