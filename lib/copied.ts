/**
 * The copy tray.
 *
 * Copying an entry does not write anything to the log — it puts a row on this
 * device's clipboard so it can be re-logged, at a different amount, on a
 * different day. That makes it device state rather than a record, which is why
 * it lives in localStorage beside the offline snapshot and not in the database:
 * a clipboard the assistant could read would be a second, invisible source of
 * truth for a day that has not happened yet.
 *
 * Scoped to a user id and cleared on logout, because a phone gets handed around.
 */

import type { Macros } from "./macros";
import type { QuantityUnit } from "./units";

const KEY = "diet.copied.v1";

/** Deep enough to be useful, shallow enough that the tray stays scannable. */
const LIMIT = 12;

export interface CopiedItem extends Macros {
  /** Stable across re-renders and unique within the tray. */
  key: string;
  name: string;
  mealType: string;
  /** Carried so a re-log keeps the product link the original row had. */
  productId: string | null;
  /** What the macros above describe. Null when the original never said. */
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /** The day it was copied from, so the tray says where a row came from. */
  fromDate: string;
  /** Epoch ms, for ordering. */
  at: number;
}

interface Tray {
  userId: string;
  items: CopiedItem[];
}

function read(): Tray | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const tray = JSON.parse(raw) as Tray;
    if (!tray?.userId || !Array.isArray(tray.items)) return null;
    return tray;
  } catch {
    return null;
  }
}

function write(tray: Tray): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tray));
  } catch {
    // Private mode or a full quota. The tray is a convenience; failing to
    // persist it must not break the copy that produced it.
  }
}

/** The tray, or an empty one when it belongs to somebody else on this device. */
export function readTray(userId: string): CopiedItem[] {
  const tray = read();
  if (!tray || tray.userId !== userId) return [];
  return tray.items;
}

/**
 * Two copies of the same row at the same amount are one entry in the tray — the
 * second refreshes the first rather than filling a slot with a duplicate.
 */
function sameThing(a: CopiedItem, b: CopiedItem): boolean {
  return (
    a.name.toLowerCase() === b.name.toLowerCase() &&
    a.calories === b.calories &&
    a.quantity === b.quantity &&
    a.quantityUnit === b.quantityUnit
  );
}

export function addToTray(
  userId: string,
  item: Omit<CopiedItem, "key" | "at">,
): CopiedItem[] {
  const next: CopiedItem = {
    ...item,
    key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  };
  const items = [next, ...readTray(userId).filter((i) => !sameThing(i, next))].slice(0, LIMIT);
  write({ userId, items });
  return items;
}

/** Several rows at once, newest-first in the order given. */
export function addManyToTray(
  userId: string,
  incoming: Omit<CopiedItem, "key" | "at">[],
): CopiedItem[] {
  let items = readTray(userId);
  for (const item of incoming) {
    const next: CopiedItem = {
      ...item,
      key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
    };
    items = [next, ...items.filter((i) => !sameThing(i, next))];
  }
  items = items.slice(0, LIMIT);
  write({ userId, items });
  return items;
}

export function removeFromTray(userId: string, key: string): CopiedItem[] {
  const items = readTray(userId).filter((i) => i.key !== key);
  write({ userId, items });
  return items;
}

export function clearTray(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}

/** Drop a tray that belongs to somebody else on this device. */
export function clearTrayUnless(userId: string): void {
  const tray = read();
  if (tray && tray.userId !== userId) clearTray();
}
