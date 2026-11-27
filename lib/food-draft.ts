import { z } from "zod";
import { QUANTITY_UNITS, SERVING_UNITS } from "./units";

const unit = z.enum(QUANTITY_UNITS);
const draftSchema = z.object({
  q: z.string(), name: z.string(),
  vals: z.object({ calories: z.string(), protein: z.string(), carbs: z.string(), fat: z.string(), fiber: z.string(), sugar: z.string(), sodium: z.string() }),
  reference: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("portion") }),
    z.object({ kind: z.literal("per"), amount: z.number().positive(), unit }),
    z.object({ kind: z.literal("unitless") }),
  ]),
  amount: z.string(), unit, multiple: z.string(),
  serving: z.object({ size: z.number().positive(), unit: z.enum(SERVING_UNITS) }).nullable(),
  productId: z.string().nullable(),
  origin: z.object({ label: z.string(), detail: z.string() }).nullable(),
  showTrace: z.boolean(),
  // Older drafts always carried a meal. New drafts can intentionally leave it
  // blank while someone is filling a historical-day entry, so reopening one
  // cannot turn a clock-derived default into a confirmed choice.
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable(),
});
export type FoodDraft = z.infer<typeof draftSchema>;
type DraftStore = { userId: string; days: Record<string, FoodDraft> };
const KEY = "diet.food-drafts.v1";
const MAX_DAYS = 14;
// Also retain drafts for the current session when browser storage is unavailable.
let memory: DraftStore | null = null;

function readStore(): DraftStore | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { userId?: unknown; days?: unknown } | null;
    if (!obj || typeof obj.userId !== "string" || !obj.days || typeof obj.days !== "object") {
      return null;
    }
    const validDays: Record<string, FoodDraft> = {};
    for (const [k, v] of Object.entries(obj.days as Record<string, unknown>)) {
      const parsed = draftSchema.safeParse(v);
      if (parsed.success) validDays[k] = parsed.data;
    }
    memory = { userId: obj.userId, days: validDays };
    return memory;
  } catch {
    return memory;
  }
}

export function readFoodDraft(userId: string, date: string): FoodDraft | null {
  const store = readStore();
  return store?.userId === userId ? store.days[date] ?? null : null;
}

export function writeFoodDraft(userId: string, date: string, draft: FoodDraft | null) {
  const previous = readStore();
  const days = previous?.userId === userId ? { ...previous.days } : {};
  if (draft) days[date] = draft;
  else delete days[date];
  const keys = Object.keys(days).sort();
  while (keys.length > MAX_DAYS) {
    const oldest = keys.shift();
    if (oldest) delete days[oldest];
  }
  memory = { userId, days };
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* keep session draft */ }
}

export function clearFoodDrafts() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* unavailable storage */ }
}

export function clearFoodDraftsUnless(userId: string) {
  const store = readStore();
  if (store && store.userId !== userId) clearFoodDrafts();
}
