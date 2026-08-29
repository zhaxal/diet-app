import type { RecentFood } from "./api-client";

/**
 * Ranking for the Recent strip.
 *
 * It used to be ordered by recency alone, deduped by name — so a one-off eaten
 * yesterday outranked the porridge eaten every single morning, on what is the
 * most-used capture path in the app.
 *
 * Three factors, in the order they matter:
 *
 *  1. **How often.** The base score. A food eaten twelve times is twelve times
 *     the candidate of a food eaten once.
 *  2. **Whether it belongs to this meal.** Weighted by the share of its own
 *     occurrences that landed on the meal currently selected, so the strip
 *     answers "what do I eat at breakfast" at 8am and "what do I eat at dinner"
 *     at 7pm — from the same data, with no round trip.
 *  3. **How recently.** A half-life, not a cutoff. Something eaten daily for a
 *     month and then dropped should fade rather than vanish, because the reason
 *     it stopped is usually that it ran out.
 *
 * Deliberately not included: calories, macros, or anything resembling a
 * judgement about the food. The strip offers what you eat, not what it thinks
 * you should.
 */

/** Days for a food's recency weight to halve. */
const HALF_LIFE_DAYS = 14;

/** How much a perfect meal match is worth. 1.0 doubles the score. */
const MEAL_WEIGHT = 1.0;

/** Recency never drives the score below this share of its frequency. */
const RECENCY_FLOOR = 0.35;

export function scoreRecent(food: RecentFood, meal: string, now = Date.now()): number {
  const count = Math.max(1, food.count ?? 1);

  // 0 when this food is never eaten at the selected meal, 1 when it always is.
  const atThisMeal = food.byMeal?.[meal] ?? 0;
  const affinity = count > 0 ? atThisMeal / count : 0;
  const mealBoost = 1 + MEAL_WEIGHT * affinity;

  const days = Math.max(0, (now - new Date(food.lastAt ?? now).getTime()) / 86_400_000);
  const decay = Math.pow(0.5, days / HALF_LIFE_DAYS);
  const recency = RECENCY_FLOOR + (1 - RECENCY_FLOOR) * decay;

  return count * mealBoost * recency;
}

/** Highest-scoring first. Ties break on recency, then name, so it is stable. */
export function rankRecent(recent: RecentFood[], meal: string, now = Date.now()): RecentFood[] {
  return [...recent].sort((a, b) => {
    const d = scoreRecent(b, meal, now) - scoreRecent(a, meal, now);
    if (d !== 0) return d;
    const t = new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime();
    return t !== 0 ? t : a.name.localeCompare(b.name);
  });
}
