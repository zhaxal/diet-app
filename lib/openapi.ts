import { MEAL_TYPES } from "./validation";

/**
 * Hand-maintained OpenAPI 3.1 description of the Diet Tracker API.
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
    mealType: { type: "string", enum: [...MEAL_TYPES], example: "breakfast" },
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

  return {
    openapi: "3.1.0",
    info: {
      title: "Diet Tracker API",
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
          description: "Any subset of the create fields.",
          properties: {
            name: entryProps.name,
            calories: entryProps.calories,
            protein: entryProps.protein,
            carbs: entryProps.carbs,
            fat: entryProps.fat,
            mealType: entryProps.mealType,
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
    },
  };
}
