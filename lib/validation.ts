import { z } from "zod";
import { isValidTimeZone } from "./time";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const credentialsSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const nutrient = () => z.number().min(0).max(1000000).optional().default(0);

// Shared shape for the nutritional fields of a food entry.
const entryBase = {
  name: z.string().min(1, "Food name is required").max(200),
  calories: z.number().int("Calories must be a whole number").min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(), // mg
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
    protein: z.number().min(0).max(1000000).optional(),
    carbs: z.number().min(0).max(1000000).optional(),
    fat: z.number().min(0).max(1000000).optional(),
    fiber: z.number().min(0).max(1000000).optional(),
    sugar: z.number().min(0).max(1000000).optional(),
    sodium: z.number().min(0).max(1000000).optional(),
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

const goalField = () => z.number().min(0).max(1000000).nullable().optional();

export const goalsSchema = z.object({
  dailyCalories: z.number().int().min(0).max(100000).nullable().optional(),
  dailyProtein: goalField(),
  dailyCarbs: goalField(),
  dailyFat: goalField(),
  dailyFiber: goalField(),
  dailySugar: goalField(),
  dailySodium: goalField(),
  weightUnit: z.enum(["kg", "lb"]).optional(),
  timezone: z
    .string()
    .refine(isValidTimeZone, "Invalid IANA timezone")
    .optional(),
  // TDEE profile.
  sex: z.enum(["male", "female"]).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  heightCm: z.number().min(50).max(300).nullable().optional(),
});

export const weightSchema = z.object({
  weight: z.number().positive("Weight must be positive").max(1000),
  loggedAt: z.string().datetime({ offset: true }).optional(),
});

export const favoriteSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(),
  mealType: z.enum(MEAL_TYPES).optional(),
});

// A single item inside a meal template.
export const templateItemSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(),
  mealType: z.enum(MEAL_TYPES),
});

export const templateSchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(templateItemSchema).min(1, "A template needs at least one item"),
});

export const copyDaySchema = z.object({
  from: dateQuerySchema,
  to: dateQuerySchema,
});

export const applyTemplateSchema = z.object({
  date: dateQuerySchema,
});

export type GoalsInput = z.infer<typeof goalsSchema>;
export type WeightInput = z.infer<typeof weightSchema>;
export type FavoriteInput = z.infer<typeof favoriteSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type TemplateItem = z.infer<typeof templateItemSchema>;
