import { MEAL_TYPES } from "./validation";
import { QUANTITY_UNITS, WEIGHT_UNITS } from "./units";

/**
 * Hand-maintained OpenAPI 3.1 description of the rationd API.
 * Served at /api/openapi.json and rendered at /api-docs.
 *
 * Auth model: call POST /auth/login to obtain a JWT, then send it as
 * `Authorization: Bearer <token>` on every request. Tokens last 30 days.
 */
export function buildOpenApiDocument(baseUrl?: string) {
  const entryProps = {
    id: { type: "string", readOnly: true },
    userId: { type: "string", readOnly: true },
    name: { type: "string", example: "Oatmeal with berries" },
    calories: { type: "integer", minimum: 0, example: 320 },
    protein: { type: "number", minimum: 0, description: "grams", example: 12 },
    carbs: { type: "number", minimum: 0, description: "grams", example: 54 },
    fat: { type: "number", minimum: 0, description: "grams", example: 6 },
    fiber: { type: "number", minimum: 0, description: "grams", example: 8 },
    sugar: { type: "number", minimum: 0, description: "grams", example: 11 },
    sodium: { type: "number", minimum: 0, description: "milligrams", example: 240 },
    mealType: { type: "string", enum: [...MEAL_TYPES], example: "breakfast" },
    // Provenance. A quantity is a number and a unit — never a bare number whose
    // unit is implied by a field name.
    productId: {
      type: ["string", "null"],
      description: "The saved product this was logged from, if any.",
    },
    quantity: {
      type: ["number", "null"],
      description: "Amount consumed, measured in `quantityUnit`.",
      example: 200,
    },
    quantityUnit: {
      type: ["string", "null"],
      enum: [...QUANTITY_UNITS, null],
      description:
        "Unit of `quantity`. Must match how the product is measured: g/oz against a 100g product, ml/floz against a 100ml one, or `serving` when the product declares one.",
    },
    source: {
      type: "string",
      enum: ["ui", "mcp", "import"],
      readOnly: true,
      description: "Which front door wrote the row: the web UI, the assistant, or an import.",
    },
    consumedAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time", readOnly: true },
  };

  const jsonBody = (schemaRef: object) => ({
    required: true,
    content: { "application/json": { schema: schemaRef } },
  });

  const jsonResponse = (description: string, schemaRef: object) => ({
    description,
    content: { "application/json": { schema: schemaRef } },
  });

  const totals = {
    type: "object",
    properties: {
      calories: { type: "number" },
      protein: { type: "number" },
      carbs: { type: "number" },
      fat: { type: "number" },
      count: { type: "integer" },
    },
  };

  const mealTotals = {
    type: "object",
    description: "Range totals for one meal slot.",
    properties: {
      calories: { type: "number" },
      count: { type: "integer" },
    },
  };

  const weightLog = {
    type: "object",
    description:
      "A body-weight reading. Stored canonically in kilograms with the unit it " +
      "was entered in recorded beside it, so changing the account's display " +
      "unit re-renders history rather than reinterpreting it.",
    properties: {
      id: { type: "string", readOnly: true },
      weight: {
        type: "number",
        description: "The reading in the account's display unit.",
        example: 80.5,
      },
      weightKg: { type: "number", readOnly: true, description: "The canonical value." },
      enteredUnit: {
        type: "string",
        enum: [...WEIGHT_UNITS],
        readOnly: true,
        description: "The unit this reading was originally entered in.",
      },
      loggedAt: { type: "string", format: "date-time" },
    },
  };

  const trends = {
    type: "object",
    description:
      "Per-day nutrition totals over a trailing window, plus the range's " +
      "weight readings and its calorie distribution across meal slots. " +
      "Every figure is an aggregation of entries reachable through /entries; " +
      "this endpoint exists so a caller does not have to page the range itself.",
    properties: {
      days: {
        type: "integer",
        description:
          "The width of the window that was actually served, in days. Not " +
          "always the width that was asked for: `all` resolves to one, and an " +
          "over-long `from` is clamped to one.",
      },
      from: { type: "string", example: "2026-08-01" },
      to: { type: "string", example: "2026-08-30" },
      nutrition: {
        type: "array",
        description:
          "One element per local calendar day in the window, oldest first. " +
          "Days with no entries are present with zeroes and `count: 0` — a " +
          "zero here means unlogged, not a day of no food.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", example: "2026-08-29" },
            calories: { type: "number" },
            protein: { type: "number", description: "grams" },
            carbs: { type: "number", description: "grams" },
            fat: { type: "number", description: "grams" },
            fiber: { type: "number", description: "grams" },
            sugar: { type: "number", description: "grams" },
            sodium: { type: "number", description: "milligrams" },
            count: { type: "integer", description: "entries logged that day" },
          },
        },
      },
      weight: {
        type: "array",
        description: "The last reading on each day that has one.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", example: "2026-08-29" },
            value: { type: "number" },
          },
        },
      },
      meals: {
        type: "object",
        description: "Range totals per meal slot, not averages.",
        properties: Object.fromEntries(MEAL_TYPES.map((m) => [m, mealTotals])),
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "rationd API",
      version: "1.0.0",
      description:
        "Log and review food entries (calories + macros). Authenticate via " +
        "POST /auth/login to get a JWT, then send `Authorization: Bearer <token>`.",
    },
    servers: [{ url: baseUrl ? `${baseUrl}/api` : "/api" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Credentials: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "me@example.com" },
            password: { type: "string", minLength: 8, example: "password123" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            token: { type: "string", description: "JWT, valid for 30 days" },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        FoodEntry: { type: "object", properties: entryProps },
        CreateEntry: {
          type: "object",
          required: ["name", "calories", "mealType"],
          properties: {
            name: entryProps.name,
            calories: entryProps.calories,
            protein: entryProps.protein,
            carbs: entryProps.carbs,
            fat: entryProps.fat,
            mealType: entryProps.mealType,
            consumedAt: {
              type: "string",
              format: "date-time",
              description: "Optional ISO 8601 timestamp; defaults to now.",
            },
          },
        },
        UpdateEntry: {
          type: "object",
          description:
            "Any subset of the create fields. `quantity` and `quantityUnit` are " +
            "correctable like anything else, and either may be sent as null to " +
            "drop an amount the row should no longer claim.",
          properties: {
            name: entryProps.name,
            calories: entryProps.calories,
            protein: entryProps.protein,
            carbs: entryProps.carbs,
            fat: entryProps.fat,
            fiber: entryProps.fiber,
            sugar: entryProps.sugar,
            sodium: entryProps.sodium,
            mealType: entryProps.mealType,
            quantity: entryProps.quantity,
            quantityUnit: entryProps.quantityUnit,
            consumedAt: { type: "string", format: "date-time" },
          },
        },
        Summary: {
          type: "object",
          properties: {
            date: { type: "string", example: "2026-06-30" },
            total: totals,
            byMeal: {
              type: "object",
              properties: Object.fromEntries(
                MEAL_TYPES.map((m) => [m, totals]),
              ),
            },
          },
        },
        Trends: trends,
        WeightLog: weightLog,
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Create a new account",
          security: [],
          requestBody: jsonBody({ $ref: "#/components/schemas/Credentials" }),
          responses: {
            "201": jsonResponse("Account created", {
              $ref: "#/components/schemas/AuthResponse",
            }),
            "409": jsonResponse("Email already in use", {
              $ref: "#/components/schemas/Error",
            }),
            "422": jsonResponse("Validation error", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Log in and receive a JWT",
          security: [],
          requestBody: jsonBody({ $ref: "#/components/schemas/Credentials" }),
          responses: {
            "200": jsonResponse("Authenticated", {
              $ref: "#/components/schemas/AuthResponse",
            }),
            "401": jsonResponse("Invalid credentials", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Clear the auth cookie",
          responses: { "200": { description: "Logged out" } },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get the current user",
          responses: {
            "200": jsonResponse("Current user", {
              type: "object",
              properties: { user: { $ref: "#/components/schemas/User" } },
            }),
            "401": jsonResponse("Unauthorized", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/entries": {
        get: {
          tags: ["Entries"],
          summary: "List entries",
          parameters: [
            {
              name: "date",
              in: "query",
              required: false,
              schema: { type: "string", example: "2026-06-30" },
              description: "Filter to a single day (YYYY-MM-DD).",
            },
          ],
          responses: {
            "200": jsonResponse("List of entries", {
              type: "object",
              properties: {
                entries: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FoodEntry" },
                },
              },
            }),
            "401": jsonResponse("Unauthorized", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
        post: {
          tags: ["Entries"],
          summary: "Create an entry",
          requestBody: jsonBody({ $ref: "#/components/schemas/CreateEntry" }),
          responses: {
            "201": jsonResponse("Created entry", {
              type: "object",
              properties: { entry: { $ref: "#/components/schemas/FoodEntry" } },
            }),
            "401": jsonResponse("Unauthorized", {
              $ref: "#/components/schemas/Error",
            }),
            "422": jsonResponse("Validation error", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/entries/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        get: {
          tags: ["Entries"],
          summary: "Get an entry",
          responses: {
            "200": jsonResponse("Entry", {
              type: "object",
              properties: { entry: { $ref: "#/components/schemas/FoodEntry" } },
            }),
            "404": jsonResponse("Not found", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
        patch: {
          tags: ["Entries"],
          summary: "Update an entry",
          requestBody: jsonBody({ $ref: "#/components/schemas/UpdateEntry" }),
          responses: {
            "200": jsonResponse("Updated entry", {
              type: "object",
              properties: { entry: { $ref: "#/components/schemas/FoodEntry" } },
            }),
            "404": jsonResponse("Not found", {
              $ref: "#/components/schemas/Error",
            }),
            "422": jsonResponse("Validation error", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
        delete: {
          tags: ["Entries"],
          summary: "Delete an entry",
          responses: {
            "200": { description: "Deleted" },
            "404": jsonResponse("Not found", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/weight": {
        get: {
          tags: ["Weight"],
          summary: "List body-weight readings",
          description: "Defaults to the last 30 days. `unit` names the account's display unit.",
          responses: {
            "200": jsonResponse("Weight readings", {
              type: "object",
              properties: {
                unit: { type: "string", enum: [...WEIGHT_UNITS] },
                logs: { type: "array", items: { $ref: "#/components/schemas/WeightLog" } },
              },
            }),
            "401": jsonResponse("Unauthorized", { $ref: "#/components/schemas/Error" }),
          },
        },
        post: {
          tags: ["Weight"],
          summary: "Log a body-weight reading",
          requestBody: jsonBody({
            type: "object",
            required: ["weight"],
            properties: {
              weight: { type: "number", exclusiveMinimum: 0, maximum: 1000, example: 80.5 },
              unit: {
                type: "string",
                enum: [...WEIGHT_UNITS],
                description:
                  "The unit `weight` is given in. Defaults to the account's setting. The value is converted to kilograms for storage either way.",
              },
              loggedAt: { type: "string", format: "date-time" },
            },
          }),
          responses: {
            "201": jsonResponse("Created", {
              type: "object",
              properties: {
                unit: { type: "string", enum: [...WEIGHT_UNITS] },
                log: { $ref: "#/components/schemas/WeightLog" },
              },
            }),
            "401": jsonResponse("Unauthorized", { $ref: "#/components/schemas/Error" }),
          },
        },
      },
      "/trends": {
        get: {
          tags: ["Summary"],
          summary: "Per-day totals over a window",
          description:
            "The range view behind the Trends tab, and the source of the week " +
            "strip's per-day bars. Documented because the assistant reads the " +
            "same day the UI does, and nothing the screen can see should be " +
            "reachable only through the browser.",
          parameters: [
            {
              name: "days",
              in: "query",
              required: false,
              schema: { type: "string", example: "30", default: "30" },
              description:
                "Window length in days, counting back from today: any integer " +
                "from 1 to 3660, or `all` for everything since the first record. " +
                "Anything unparseable is treated as 30. Ignored when `from` is given.",
            },
            {
              name: "from",
              in: "query",
              required: false,
              schema: { type: "string", example: "2026-08-01" },
              description:
                "First local calendar day of the window (YYYY-MM-DD). Takes " +
                "precedence over `days`. Windows longer than 3660 days are " +
                "clamped, and the response says which window was served.",
            },
            {
              name: "to",
              in: "query",
              required: false,
              schema: { type: "string", example: "2026-08-31" },
              description: "Last local calendar day of the window. Defaults to today.",
            },
          ],
          responses: {
            "200": jsonResponse("Trends over the window", {
              $ref: "#/components/schemas/Trends",
            }),
            "401": jsonResponse("Unauthorized", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/summary": {
        get: {
          tags: ["Summary"],
          summary: "Daily nutrition totals",
          parameters: [
            {
              name: "date",
              in: "query",
              required: false,
              schema: { type: "string", example: "2026-06-30" },
              description: "Day to summarize (YYYY-MM-DD). Defaults to today.",
            },
          ],
          responses: {
            "200": jsonResponse("Daily summary", {
              $ref: "#/components/schemas/Summary",
            }),
            "401": jsonResponse("Unauthorized", {
              $ref: "#/components/schemas/Error",
            }),
          },
        },
      },
      "/workouts": {
        get: {
          tags: ["Workouts"],
          summary: "Get workout for a day",
          parameters: [
            {
              name: "date",
              in: "query",
              required: true,
              schema: { type: "string", example: "2026-09-11" },
              description: "Day to retrieve workout for (YYYY-MM-DD)",
            },
          ],
          responses: {
            "200": jsonResponse("Workout details and exercise stats", {
              type: "object",
              properties: {
                workout: { type: ["object", "null"] },
                exerciseStats: { type: "object" },
              },
            }),
            "401": jsonResponse("Unauthorized", { $ref: "#/components/schemas/Error" }),
          },
        },
        post: {
          tags: ["Workouts"],
          summary: "Create or update a workout using Obsidian-style markdown",
          requestBody: jsonBody({
            type: "object",
            required: ["date", "rawNote"],
            properties: {
              date: { type: "string", example: "2026-09-11" },
              title: { type: "string", example: "Push Day" },
              rawNote: { type: "string", example: "Bench Press\n- 80kg x 8\n- 85kg x 6" },
              source: { type: "string", enum: ["ui", "mcp"], default: "ui" },
            },
          }),
          responses: {
            "200": jsonResponse("Saved workout and performance stats", {
              type: "object",
              properties: {
                workout: { type: "object" },
                exerciseStats: { type: "object" },
              },
            }),
            "401": jsonResponse("Unauthorized", { $ref: "#/components/schemas/Error" }),
          },
        },
      },
      "/exercises": {
        get: {
          tags: ["Workouts"],
          summary: "List or search user exercises with performance summaries",
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Search filter for exercise name",
            },
          ],
          responses: {
            "200": jsonResponse("List of exercises", {
              type: "object",
              properties: {
                exercises: { type: "array", items: { type: "object" } },
              },
            }),
            "401": jsonResponse("Unauthorized", { $ref: "#/components/schemas/Error" }),
          },
        },
      },
    },
  };
}

