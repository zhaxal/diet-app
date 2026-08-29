import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { copyDaySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, localTimeInTz, zonedWallToUtc } from "@/lib/time";

// POST /api/entries/copy { from, to } — duplicate all of `from`'s entries to `to`.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = copyDaySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { from, to } = parsed.data;

  // Copying a day onto itself doubles it, irreversibly. The UI now prevents it,
  // but the API must not depend on the UI for that.
  if (from === to) {
    return jsonError("Cannot copy a day onto itself", 400);
  }

  const { start, end } = dayBoundsInTz(from, user.timezone);
  const source = await prisma.foodEntry.findMany({
    where: { userId: user.id, consumedAt: { gte: start, lt: end } },
  });

  if (source.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

  // Keep each entry's time of day rather than collapsing the whole day onto
  // noon. A copied day that says breakfast happened at 08:12 and dinner at 19:40
  // still interleaves correctly with anything the assistant logs alongside it.
  const timeOfDay = (e: { consumedAt: Date }) =>
    zonedWallToUtc(to, localTimeInTz(e.consumedAt, user.timezone), user.timezone);

  await prisma.foodEntry.createMany({
    data: source.map((e) => ({
      userId: user.id,
      name: e.name,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fiber: e.fiber,
      sugar: e.sugar,
      sodium: e.sodium,
      mealType: e.mealType,
      // Provenance travels with the copy. Dropping it turned "200g of the
      // yoghurt I saved" into an anonymous row of numbers, which is precisely
      // the re-reading the product catalog exists to avoid.
      productId: e.productId,
      quantity: e.quantity,
      quantityUnit: e.quantityUnit,
      // A copy is written by whoever asked for the copy, not by the front door
      // that logged the original.
      source: e.source,
      consumedAt: timeOfDay(e),
    })),
  });

  return NextResponse.json({ copied: source.length });
}
