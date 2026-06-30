import { z } from "zod";
import { isValidTimeZone } from "./time";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const credentialsSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Shared shape for the nutritional fields of a food entry.
const entryBase = {
  name: z.string().min(1, "Food name is required").max(200),
  calories: z.number().int("Calories must be a whole number").min(0).max(100000),
  protein: z.number().min(0).max(100000).optional().default(0),
  carbs: z.number().min(0).max(100000).optional().default(0),
  fat: z.number().min(0).max(100000).optional().default(0),
  mealType: z.enum(MEAL_TYPES),
  // ISO 8601 timestamp; defaults to "now" server-side when omitted.
  consumedAt: z.string().datetime({ offset: true }).optional(),
};

export const createEntrySchema = z.object(entryBase);

// All fields optional for partial updates, but at least one must be present.
export const updateEntrySchema = z
  .object({
    name: entryBase.name.optional(),
    calories: entryBase.calories.optional(),
    protein: z.number().min(0).max(100000).optional(),
    carbs: z.number().min(0).max(100000).optional(),
    fat: z.number().min(0).max(100000).optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
    consumedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// YYYY-MM-DD date filter used by the list and summary endpoints.
export const dateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

export const goalsSchema = z.object({
  dailyCalories: z.number().int().min(0).max(100000).nullable().optional(),
  dailyProtein: z.number().min(0).max(100000).nullable().optional(),
  dailyCarbs: z.number().min(0).max(100000).nullable().optional(),
  dailyFat: z.number().min(0).max(100000).nullable().optional(),
  weightUnit: z.enum(["kg", "lb"]).optional(),
  timezone: z
    .string()
    .refine(isValidTimeZone, "Invalid IANA timezone")
    .optional(),
});

export const weightSchema = z.object({
  weight: z.number().positive("Weight must be positive").max(1000),
  loggedAt: z.string().datetime({ offset: true }).optional(),
});

export const favoriteSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(100000),
  protein: z.number().min(0).max(100000).optional().default(0),
  carbs: z.number().min(0).max(100000).optional().default(0),
  fat: z.number().min(0).max(100000).optional().default(0),
  mealType: z.enum(MEAL_TYPES).optional(),
});

export type GoalsInput = z.infer<typeof goalsSchema>;
export type WeightInput = z.infer<typeof weightSchema>;
export type FavoriteInput = z.infer<typeof favoriteSchema>;
