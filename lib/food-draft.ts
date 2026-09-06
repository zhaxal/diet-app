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
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});
export type FoodDraft = z.infer<typeof draftSchema>;
const storeSchema = z.object({ userId: z.string(), days: z.record(draftSchema) });
type DraftStore = z.infer<typeof storeSchema>;
const KEY = "diet.food-drafts.v1";
// Also retain drafts for the current session when browser storage is unavailable.
let memory: DraftStore | null = null;

function readStore(): DraftStore | null {
  if (memory) return memory;
  try {
    const parsed = storeSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    memory = parsed.success ? parsed.data : null;
  } catch { /* malformed or unavailable storage is not a broken form */ }
  return memory;
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
