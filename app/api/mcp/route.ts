import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayBoundsInTz, todayInTz, isValidTimeZone } from "@/lib/time";

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
        fiber: { type: "number", minimum: 0, description: "grams" },
        sugar: { type: "number", minimum: 0, description: "grams" },
        sodium: { type: "number", minimum: 0, description: "milligrams" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        consumedAt: { type: "string", format: "date-time", description: "ISO 8601 timestamp — defaults to now" },
      },
    },
  },
  {
    name: "get_summary",
    description: "Get daily nutrition totals (calories + macros) for a date, including progress toward daily goals if set.",
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
  {
    name: "set_goals",
    description: "Set daily calorie and macro targets. Pass null to clear a goal.",
    inputSchema: {
      type: "object",
      properties: {
        dailyCalories: { type: ["integer", "null"], description: "kcal target" },
        dailyProtein: { type: ["number", "null"], description: "grams" },
        dailyCarbs: { type: ["number", "null"], description: "grams" },
        dailyFat: { type: ["number", "null"], description: "grams" },
        dailyFiber: { type: ["number", "null"], description: "grams" },
        dailySugar: { type: ["number", "null"], description: "grams" },
        dailySodium: { type: ["number", "null"], description: "milligrams" },
        weightUnit: { type: "string", enum: ["kg", "lb"] },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Almaty'" },
      },
    },
  },
  {
    name: "log_weight",
    description: "Log a body weight measurement.",
    inputSchema: {
      type: "object",
      required: ["weight"],
      properties: {
        weight: { type: "number", description: "Weight value (in your weight unit)" },
        loggedAt: { type: "string", format: "date-time", description: "Defaults to now" },
      },
    },
  },
  {
    name: "list_weight",
    description: "List recent weight log entries (last 30 days).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_favorites",
    description: "List saved favorites and recently eaten foods. Use these IDs/names when logging recurring meals.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_favorite",
    description: "Save a food as a favorite for quick re-logging.",
    inputSchema: {
      type: "object",
      required: ["name", "calories"],
      properties: {
        name: { type: "string" },
        calories: { type: "integer", minimum: 0 },
        protein: { type: "number", minimum: 0 },
        carbs: { type: "number", minimum: 0 },
        fat: { type: "number", minimum: 0 },
        fiber: { type: "number", minimum: 0 },
        sugar: { type: "number", minimum: 0 },
        sodium: { type: "number", minimum: 0, description: "milligrams" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
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

async function callTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  tz: string,
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
          fiber: args.fiber != null ? Number(args.fiber) : 0,
          sugar: args.sugar != null ? Number(args.sugar) : 0,
          sodium: args.sodium != null ? Number(args.sodium) : 0,
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
      const date = (args.date as string | undefined) ?? todayInTz(tz);
      const { start, end } = dayBoundsInTz(date, tz);
      const [entries, user] = await Promise.all([
        prisma.foodEntry.findMany({ where: { userId, consumedAt: { gte: start, lt: end } } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            dailyCalories: true, dailyProtein: true, dailyCarbs: true, dailyFat: true,
            dailyFiber: true, dailySugar: true, dailySodium: true,
          },
        }),
      ]);
      const t = entries.reduce(
        (a, e) => ({
          calories: a.calories + e.calories, protein: a.protein + e.protein,
          carbs: a.carbs + e.carbs, fat: a.fat + e.fat, fiber: a.fiber + e.fiber,
          sugar: a.sugar + e.sugar, sodium: a.sodium + e.sodium, count: a.count + 1,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 },
      );
      const r = (n: number) => Math.round(n * 10) / 10;
      const line = (label: string, val: number, goal: number | null, unit: string) =>
        (goal ? ` ${label}: ${r(val)} / ${goal} (${Math.round((val / goal) * 100)}%)` : ` ${label}: ${r(val)}`) + unit;
      return (
        `Summary for ${date} (${t.count} entr${t.count === 1 ? "y" : "ies"})\n` +
        line("Calories", t.calories, user?.dailyCalories ?? null, " kcal") + "\n" +
        line("Protein", t.protein, user?.dailyProtein ?? null, "g") + "\n" +
        line("Carbs", t.carbs, user?.dailyCarbs ?? null, "g") + "\n" +
        line("Fat", t.fat, user?.dailyFat ?? null, "g") + "\n" +
        line("Fiber", t.fiber, user?.dailyFiber ?? null, "g") + "\n" +
        line("Sugar", t.sugar, user?.dailySugar ?? null, "g") + "\n" +
        line("Sodium", t.sodium, user?.dailySodium ?? null, "mg")
      );
    }

    case "list_entries": {
      const date = (args.date as string | undefined) ?? todayInTz(tz);
      const { start, end } = dayBoundsInTz(date, tz);
      const entries = await prisma.foodEntry.findMany({
        where: { userId, consumedAt: { gte: start, lt: end } },
        orderBy: { consumedAt: "asc" },
      });
      if (entries.length === 0) return `No entries for ${date}.`;
      return entries
        .map((e) => `[${e.id}] ${e.mealType} — ${e.name}: ${e.calories} kcal (P:${e.protein}g C:${e.carbs}g F:${e.fat}g)`)
        .join("\n");
    }

    case "delete_entry": {
      const entry = await prisma.foodEntry.findFirst({ where: { id: args.id as string, userId } });
      if (!entry) throw new Error(`Entry ${args.id} not found`);
      await prisma.foodEntry.delete({ where: { id: args.id as string } });
      return `Deleted "${entry.name}"`;
    }

    case "set_goals": {
      if (args.timezone != null && !isValidTimeZone(args.timezone as string)) {
        throw new Error(`Invalid timezone: ${args.timezone}`);
      }
      await prisma.user.update({ where: { id: userId }, data: args as Record<string, unknown> });
      const parts = [];
      if (args.dailyCalories != null) parts.push(`calories: ${args.dailyCalories} kcal`);
      if (args.dailyProtein != null) parts.push(`protein: ${args.dailyProtein}g`);
      if (args.dailyCarbs != null) parts.push(`carbs: ${args.dailyCarbs}g`);
      if (args.dailyFat != null) parts.push(`fat: ${args.dailyFat}g`);
      if (args.weightUnit) parts.push(`weight unit: ${args.weightUnit}`);
      if (args.timezone) parts.push(`timezone: ${args.timezone}`);
      return `Goals updated — ${parts.join(", ")}`;
    }

    case "log_weight": {
      const log = await prisma.weightLog.create({
        data: {
          userId,
          weight: Number(args.weight),
          loggedAt: args.loggedAt ? new Date(args.loggedAt as string) : undefined,
        },
      });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      return `Logged ${log.weight} ${user?.weightUnit ?? "kg"} on ${log.loggedAt.toISOString().slice(0, 10)} (id: ${log.id})`;
    }

    case "list_weight": {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [logs, user] = await Promise.all([
        prisma.weightLog.findMany({ where: { userId, loggedAt: { gte: since } }, orderBy: { loggedAt: "asc" } }),
        prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } }),
      ]);
      if (logs.length === 0) return "No weight logs in the last 30 days.";
      return logs.map((l) => `[${l.id}] ${l.loggedAt.toISOString().slice(0, 10)}: ${l.weight} ${user?.weightUnit ?? "kg"}`).join("\n");
    }

    case "list_favorites": {
      const [favorites, recent] = await Promise.all([
        prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
        prisma.foodEntry.findMany({
          where: { userId, consumedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { consumedAt: "desc" },
          take: 100,
        }),
      ]);
      const seen = new Set<string>();
      const recentUniq = recent.filter((e) => { const k = e.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
      const favLines = favorites.map((f) => `★ [fav:${f.id}] ${f.name}: ${f.calories} kcal (P:${f.protein} C:${f.carbs} F:${f.fat})${f.mealType ? ` — ${f.mealType}` : ""}`);
      const recentLines = recentUniq.map((e) => `  ${e.name}: ${e.calories} kcal (P:${e.protein} C:${e.carbs} F:${e.fat}) — ${e.mealType}`);
      return (favLines.length ? "Favorites:\n" + favLines.join("\n") + "\n\n" : "") +
        (recentLines.length ? "Recent:\n" + recentLines.join("\n") : "No recent foods.");
    }

    case "save_favorite": {
      const fav = await prisma.favorite.create({
        data: {
          userId,
          name: args.name as string,
          calories: Number(args.calories),
          protein: args.protein != null ? Number(args.protein) : 0,
          carbs: args.carbs != null ? Number(args.carbs) : 0,
          fat: args.fat != null ? Number(args.fat) : 0,
          fiber: args.fiber != null ? Number(args.fiber) : 0,
          sugar: args.sugar != null ? Number(args.sugar) : 0,
          sodium: args.sodium != null ? Number(args.sodium) : 0,
          mealType: args.mealType as string | undefined,
        },
      });
      return `Saved "${fav.name}" as a favorite (id: ${fav.id})`;
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

  // tools/call requires an API key — accepted via ?key= query param or
  // Authorization: Bearer header (query param is easier with Claude.ai connectors).
  if (method === "tools/call") {
    const keyFromQuery = req.nextUrl.searchParams.get("key");
    const authHeader = req.headers.get("authorization");
    const rawKey =
      keyFromQuery ??
      (authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null);

    let userId: string | null = null;
    let userTz = "UTC";
    if (rawKey) {
      const user = await prisma.user.findUnique({
        where: { apiKey: rawKey },
        select: { id: true, timezone: true },
      });
      if (user) {
        userId = user.id;
        userTz = user.timezone;
      }
    }

    if (!userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32001,
            message:
              "Unauthorized — use the connector URL from your dashboard (it includes your key)",
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
      const text = await callTool(name, args, userId, userTz);
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
