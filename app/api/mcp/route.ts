import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayBounds } from "@/lib/http";

const TOOLS = [
  {
    name: "log_meal",
    description:
      "Log a food entry to the diet tracker. Estimate calories and macros from the food name if the user doesn't provide them.",
    inputSchema: {
      type: "object",
      required: ["name", "calories", "mealType"],
      properties: {
        name: { type: "string", description: "Food name, e.g. 'Oatmeal with berries'" },
        calories: { type: "integer", minimum: 0, description: "kcal" },
        protein: { type: "number", minimum: 0, description: "grams" },
        carbs: { type: "number", minimum: 0, description: "grams" },
        fat: { type: "number", minimum: 0, description: "grams" },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
        },
        consumedAt: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp — defaults to now",
        },
      },
    },
  },
  {
    name: "get_summary",
    description: "Get daily nutrition totals (calories + macros) for a date.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD — defaults to today" },
      },
    },
  },
  {
    name: "list_entries",
    description: "List all food entries logged for a date.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD — defaults to today" },
      },
    },
  },
  {
    name: "delete_entry",
    description: "Delete a food entry by its ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Entry ID returned by log_meal or list_entries" },
      },
    },
  },
];

function rpcOk(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  switch (name) {
    case "log_meal": {
      const entry = await prisma.foodEntry.create({
        data: {
          userId,
          name: args.name as string,
          calories: Number(args.calories),
          protein: args.protein != null ? Number(args.protein) : 0,
          carbs: args.carbs != null ? Number(args.carbs) : 0,
          fat: args.fat != null ? Number(args.fat) : 0,
          mealType: args.mealType as string,
          consumedAt: args.consumedAt
            ? new Date(args.consumedAt as string)
            : new Date(),
        },
      });
      return (
        `Logged "${entry.name}" — ${entry.calories} kcal` +
        ` · P ${entry.protein}g · C ${entry.carbs}g · F ${entry.fat}g` +
        ` (${entry.mealType}, id: ${entry.id})`
      );
    }

    case "get_summary": {
      const date = (args.date as string | undefined) ?? todayDate();
      const { start, end } = dayBounds(date);
      const entries = await prisma.foodEntry.findMany({
        where: { userId, consumedAt: { gte: start, lt: end } },
      });
      const t = entries.reduce(
        (a, e) => ({
          calories: a.calories + e.calories,
          protein: a.protein + e.protein,
          carbs: a.carbs + e.carbs,
          fat: a.fat + e.fat,
          count: a.count + 1,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
      );
      return (
        `Summary for ${date} (${t.count} entr${t.count === 1 ? "y" : "ies"})\n` +
        `Calories: ${t.calories} kcal\n` +
        `Protein:  ${Math.round(t.protein * 10) / 10}g\n` +
        `Carbs:    ${Math.round(t.carbs * 10) / 10}g\n` +
        `Fat:      ${Math.round(t.fat * 10) / 10}g`
      );
    }

    case "list_entries": {
      const date = (args.date as string | undefined) ?? todayDate();
      const { start, end } = dayBounds(date);
      const entries = await prisma.foodEntry.findMany({
        where: { userId, consumedAt: { gte: start, lt: end } },
        orderBy: { consumedAt: "asc" },
      });
      if (entries.length === 0) return `No entries for ${date}.`;
      return entries
        .map(
          (e) =>
            `[${e.id}] ${e.mealType} — ${e.name}: ${e.calories} kcal` +
            ` (P:${e.protein}g C:${e.carbs}g F:${e.fat}g)`,
        )
        .join("\n");
    }

    case "delete_entry": {
      const entry = await prisma.foodEntry.findFirst({
        where: { id: args.id as string, userId },
      });
      if (!entry) throw new Error(`Entry ${args.id} not found`);
      await prisma.foodEntry.delete({ where: { id: args.id as string } });
      return `Deleted "${entry.name}"`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: {
    jsonrpc: string;
    method: string;
    params?: Record<string, unknown>;
    id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { method, params, id } = body;

  // Notifications are fire-and-forget — no response body required.
  if (method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  // initialize and tools/list need no auth — Claude.ai discovers tools before
  // the user has a chance to configure the Authorization header.
  if (method === "initialize") {
    const clientVersion =
      (params?.protocolVersion as string | undefined) ?? "2024-11-05";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: clientVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "diet-tracker", version: "1.0.0" },
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

  // tools/call requires an API key.
  if (method === "tools/call") {
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const key = authHeader.slice(7).trim();
      const user = await prisma.user.findUnique({
        where: { apiKey: key },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    if (!userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32001,
            message:
              "Unauthorized — set Authorization: Bearer <key> in the MCP integration header (copy your key from the dashboard)",
          },
        },
        { headers: CORS },
      );
    }

    const { name, arguments: args = {} } = (params ?? {}) as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    try {
      const text = await callTool(name, args, userId);
      return NextResponse.json(
        { jsonrpc: "2.0", id: id ?? null, result: { content: [{ type: "text", text }] } },
        { headers: CORS },
      );
    } catch (e) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            content: [
              {
                type: "text",
                text: e instanceof Error ? e.message : "Tool execution failed",
              },
            ],
            isError: true,
          },
        },
        { headers: CORS },
      );
    }
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32601, message: `Method not found: ${method}` },
    },
    { headers: CORS },
  );
}

export async function GET() {
  return NextResponse.json(
    { name: "diet-tracker", version: "1.0.0", protocol: "MCP 2024-11-05" },
    { headers: CORS },
  );
}
