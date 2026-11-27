import { MEAL_TYPES } from "./validation";
import { QUANTITY_UNITS, SERVING_UNITS, WEIGHT_UNITS } from "./units";
import { MUSCLE_GROUPS } from "./default-exercises";

/**
 * Hand-maintained OpenAPI 3.1 description of the rationd API.
 * Served at /api/openapi.json and rendered at /api-docs.
 *
 * Auth model: call POST /auth/login to obtain a JWT (set as httpOnly cookie
 * `diet_token` or sent as `Authorization: Bearer <token>`). Tokens last 30 days.
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
      description: "Which front door wrote the row: the web UI, the assistant, or an import.",
    },
    consumedAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time", readOnly: true },
  };

  const productProps = {
    id: { type: "string", readOnly: true },
    userId: { type: "string", readOnly: true },
    name: { type: "string", example: "Greek yoghurt 2%" },
    brand: { type: ["string", "null"], example: "Fage" },
    barcode: { type: ["string", "null"], example: "5201054020217" },
    basis: { type: "string", enum: ["100g", "100ml"], default: "100g" },
    calories: { type: "number", minimum: 0, description: "kcal per 100g/100ml" },
    protein: { type: "number", minimum: 0 },
    carbs: { type: "number", minimum: 0 },
    fat: { type: "number", minimum: 0 },
    fiber: { type: "number", minimum: 0 },
    sugar: { type: "number", minimum: 0 },
    sodium: { type: "number", minimum: 0 },
    servingSize: { type: ["number", "null"] },
    servingUnit: { type: ["string", "null"], enum: [...SERVING_UNITS, null] },
    source: { type: "string", enum: ["manual", "mcp", "openfoodfacts"], readOnly: true },
    createdAt: { type: "string", format: "date-time", readOnly: true },
    updatedAt: { type: "string", format: "date-time", readOnly: true },
  };

  const jsonBody = (schemaRef: object) => ({
    required: true,
    content: { "application/json": { schema: schemaRef } },
  });

  const jsonResponse = (description: string, schemaRef: object) => ({
    description,
    content: { "application/json": { schema: schemaRef } },
  });

  const errRef = { $ref: "#/components/schemas/Error" };
  const unauthorizedResp = jsonResponse("Unauthorized", errRef);
  const notFoundResp = jsonResponse("Not found", errRef);
  const validationResp = jsonResponse("Validation error", errRef);

  const totals = {
    type: "object",
    properties: {
      calories: { type: "number" },
      protein: { type: "number" },
      carbs: { type: "number" },
      fat: { type: "number" },
      fiber: { type: "number" },
      sugar: { type: "number" },
      sodium: { type: "number" },
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
      userId: { type: "string", readOnly: true },
      weight: {
        type: "number",
        description: "The reading in the account's display unit.",
        example: 80.5,
      },
      weightKg: { type: "number", readOnly: true, description: "The canonical value." },
      unit: { type: "string", enum: [...WEIGHT_UNITS], readOnly: true },
      enteredUnit: {
        type: "string",
        enum: [...WEIGHT_UNITS],
        readOnly: true,
        description: "The unit this reading was originally entered in.",
      },
      loggedAt: { type: "string", format: "date-time" },
      createdAt: { type: "string", format: "date-time", readOnly: true },
    },
  };

  const goalsSchema = {
    type: "object",
    properties: {
      dailyCalories: { type: ["integer", "null"], minimum: 0, maximum: 100000 },
      dailyProtein: { type: ["number", "null"], minimum: 0 },
      dailyCarbs: { type: ["number", "null"], minimum: 0 },
      dailyFat: { type: ["number", "null"], minimum: 0 },
      dailyFiber: { type: ["number", "null"], minimum: 0 },
      dailySugar: { type: ["number", "null"], minimum: 0 },
      dailySodium: { type: ["number", "null"], minimum: 0 },
      weightUnit: { type: "string", enum: [...WEIGHT_UNITS] },
      timezone: { type: "string", example: "UTC" },
      sex: { type: ["string", "null"], enum: ["male", "female", null] },
      birthYear: { type: ["integer", "null"], minimum: 1900, maximum: 2100 },
      heightCm: { type: ["number", "null"], minimum: 50, maximum: 300 },
    },
  };

  const trends = {
    type: "object",
    description:
      "Per-day nutrition totals over a trailing window, plus the range's " +
      "weight readings (converted to the account's `weightUnit`) and its calorie distribution across meal slots.",
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
          "Days with no entries are present with zeroes and `count: 0`.",
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
        description: "The last reading on each day that has one, in the account's `weightUnit`.",
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
        "Log and review food entries (calories + macros), products, body weight, and workouts. " +
        "Authenticate via POST /auth/login to obtain a JWT (`Authorization: Bearer <token>` or `diet_token` cookie).",
    },
    servers: [{ url: baseUrl ? `${baseUrl}/api` : "/api" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "diet_token" },
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
        MeUser: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            timezone: { type: "string" },
            weightUnit: { type: "string", enum: [...WEIGHT_UNITS] },
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
            fiber: entryProps.fiber,
            sugar: entryProps.sugar,
            sodium: entryProps.sodium,
            mealType: entryProps.mealType,
            productId: entryProps.productId,
            quantity: entryProps.quantity,
            quantityUnit: entryProps.quantityUnit,
            quantityGrams: {
              type: ["number", "null"],
              deprecated: true,
              description: "Deprecated alias for `quantity` in grams.",
            },
            source: { type: "string", enum: ["ui", "mcp"] },
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
        Product: { type: "object", properties: productProps },
        ProductInput: {
          type: "object",
          required: ["name", "calories"],
          properties: {
            name: productProps.name,
            brand: productProps.brand,
            barcode: productProps.barcode,
            basis: productProps.basis,
            calories: productProps.calories,
            protein: productProps.protein,
            carbs: productProps.carbs,
            fat: productProps.fat,
            fiber: productProps.fiber,
            sugar: productProps.sugar,
            sodium: productProps.sodium,
            servingSize: productProps.servingSize,
            servingUnit: productProps.servingUnit,
          },
        },
        Favorite: {
          type: "object",
          properties: {
            id: { type: "string", readOnly: true },
            name: { type: "string" },
            calories: { type: "integer", minimum: 0 },
            protein: { type: "number", minimum: 0 },
            carbs: { type: "number", minimum: 0 },
            fat: { type: "number", minimum: 0 },
            fiber: { type: "number", minimum: 0 },
            sugar: { type: "number", minimum: 0 },
            sodium: { type: "number", minimum: 0 },
            mealType: { type: ["string", "null"], enum: [...MEAL_TYPES, null] },
            createdAt: { type: "string", format: "date-time", readOnly: true },
          },
        },
        Goals: goalsSchema,
        Summary: {
          type: "object",
          properties: {
            date: { type: "string", example: "2026-06-30" },
            total: totals,
            byMeal: {
              type: "object",
              properties: Object.fromEntries(MEAL_TYPES.map((m) => [m, totals])),
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
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Whether this instance can serve requests",
          description: "Public. 200 while the database can be read, 503 otherwise.",
          security: [],
          responses: {
            "200": jsonResponse("Healthy", {
              type: "object",
              properties: { ok: { type: "boolean" } },
            }),
            "503": jsonResponse("The database cannot be read", {
              type: "object",
              properties: { ok: { type: "boolean" } },
            }),
          },
        },
      },
      "/export": {
        get: {
          tags: ["System"],
          summary: "Export all user data as JSON or CSV",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json", "csv"], default: "json" },
            },
          ],
          responses: {
            "200": { description: "JSON backup or CSV food entries download" },
            "401": unauthorizedResp,
          },
        },
      },
      "/auth/register": {
        get: {
          tags: ["Auth"],
          summary: "Whether this server is taking new accounts",
          security: [],
          responses: {
            "200": jsonResponse("Registration state", {
              type: "object",
              required: ["open", "inviteRequired"],
              properties: {
                open: { type: "boolean" },
                inviteRequired: { type: "boolean" },
              },
            }),
          },
        },
        post: {
          tags: ["Auth"],
          summary: "Create a new account",
          security: [],
          requestBody: jsonBody({
            allOf: [
              { $ref: "#/components/schemas/Credentials" },
              {
                type: "object",
                properties: {
                  inviteCode: { type: "string" },
                },
              },
            ],
          }),
          responses: {
            "201": jsonResponse("Account created", { $ref: "#/components/schemas/AuthResponse" }),
            "403": jsonResponse("Registration is closed, or the invite code is wrong", errRef),
            "409": jsonResponse("Email already in use", errRef),
            "422": validationResp,
            "429": jsonResponse("Too many failed attempts; see the Retry-After header", errRef),
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
            "200": jsonResponse("Authenticated", { $ref: "#/components/schemas/AuthResponse" }),
            "401": jsonResponse("Invalid credentials", errRef),
            "429": jsonResponse("Too many failed attempts; see the Retry-After header", errRef),
          },
        },
      },
      "/auth/password": {
        post: {
          tags: ["Auth"],
          summary: "Change the signed-in account's password",
          requestBody: jsonBody({
            type: "object",
            required: ["currentPassword", "newPassword"],
            properties: {
              currentPassword: { type: "string" },
              newPassword: { type: "string", minLength: 8 },
            },
          }),
          responses: {
            "200": jsonResponse("Password changed", {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                token: { type: "string" },
              },
            }),
            "401": unauthorizedResp,
            "403": jsonResponse("Current password is incorrect", errRef),
            "422": validationResp,
            "429": jsonResponse("Too many failed attempts", errRef),
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Clear the auth cookie",
          security: [],
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
              properties: { user: { $ref: "#/components/schemas/MeUser" } },
            }),
            "401": unauthorizedResp,
          },
        },
      },
      "/auth/apikey": {
        get: {
          tags: ["Auth"],
          summary: "Get the current MCP/assistant API key",
          responses: {
            "200": jsonResponse("API key", {
              type: "object",
              properties: { apiKey: { type: "string" } },
            }),
            "401": unauthorizedResp,
          },
        },
        post: {
          tags: ["Auth"],
          summary: "Rotate the MCP/assistant API key",
          responses: {
            "200": jsonResponse("New API key", {
              type: "object",
              properties: { apiKey: { type: "string" } },
            }),
            "401": unauthorizedResp,
          },
        },
      },
      "/goals": {
        get: {
          tags: ["Goals"],
          summary: "Get nutrition goals and profile settings",
          responses: {
            "200": jsonResponse("Goals", {
              type: "object",
              properties: { goals: { $ref: "#/components/schemas/Goals" } },
            }),
            "401": unauthorizedResp,
          },
        },
        put: {
          tags: ["Goals"],
          summary: "Update nutrition goals and profile settings",
          requestBody: jsonBody({ $ref: "#/components/schemas/Goals" }),
          responses: {
            "200": jsonResponse("Updated goals", {
              type: "object",
              properties: { goals: { $ref: "#/components/schemas/Goals" } },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
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
                entries: { type: "array", items: { $ref: "#/components/schemas/FoodEntry" } },
              },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
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
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/entries/copy": {
        post: {
          tags: ["Entries"],
          summary: "Copy all food entries from one local day to another",
          requestBody: jsonBody({
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string", example: "2026-08-29" },
              to: { type: "string", example: "2026-08-30" },
            },
          }),
          responses: {
            "200": jsonResponse("Copied count", {
              type: "object",
              properties: { copied: { type: "integer" } },
            }),
            "400": jsonResponse("Cannot copy a day onto itself", errRef),
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/entries/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        get: {
          tags: ["Entries"],
          summary: "Get an entry",
          responses: {
            "200": jsonResponse("Entry", {
              type: "object",
              properties: { entry: { $ref: "#/components/schemas/FoodEntry" } },
            }),
            "401": unauthorizedResp,
            "404": notFoundResp,
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
            "401": unauthorizedResp,
            "404": notFoundResp,
            "422": validationResp,
          },
        },
        delete: {
          tags: ["Entries"],
          summary: "Delete an entry",
          responses: {
            "200": { description: "Deleted" },
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/products": {
        get: {
          tags: ["Products"],
          summary: "List or search saved products",
          parameters: [
            { name: "q", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            "200": jsonResponse("Saved products", {
              type: "object",
              properties: {
                products: { type: "array", items: { $ref: "#/components/schemas/Product" } },
              },
            }),
            "401": unauthorizedResp,
          },
        },
        post: {
          tags: ["Products"],
          summary: "Save or update a product",
          requestBody: jsonBody({ $ref: "#/components/schemas/ProductInput" }),
          responses: {
            "200": jsonResponse("Updated product", {
              type: "object",
              properties: { product: { $ref: "#/components/schemas/Product" } },
            }),
            "201": jsonResponse("Created product", {
              type: "object",
              properties: { product: { $ref: "#/components/schemas/Product" } },
            }),
            "401": unauthorizedResp,
            "409": jsonResponse("Barcode conflict", errRef),
            "422": validationResp,
          },
        },
      },
      "/products/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        patch: {
          tags: ["Products"],
          summary: "Update a saved product",
          requestBody: jsonBody({ $ref: "#/components/schemas/ProductInput" }),
          responses: {
            "200": jsonResponse("Updated product", {
              type: "object",
              properties: { product: { $ref: "#/components/schemas/Product" } },
            }),
            "401": unauthorizedResp,
            "404": notFoundResp,
            "409": jsonResponse("Barcode conflict", errRef),
            "422": validationResp,
          },
        },
        delete: {
          tags: ["Products"],
          summary: "Delete a saved product",
          responses: {
            "200": { description: "Deleted" },
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/products/barcode/{code}": {
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        get: {
          tags: ["Products"],
          summary: "Look up a product by barcode (catalog first, then Open Food Facts)",
          responses: {
            "200": jsonResponse("Lookup result", {
              type: "object",
              properties: {
                source: { type: "string", enum: ["saved", "openfoodfacts", "none"] },
                product: { oneOf: [{ $ref: "#/components/schemas/Product" }, { type: "null" }] },
              },
            }),
            "400": jsonResponse("Invalid barcode", errRef),
            "401": unauthorizedResp,
          },
        },
      },
      "/foods/search": {
        get: {
          tags: ["Products"],
          summary: "Search Open Food Facts server-side",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": jsonResponse("Search results", {
              type: "object",
              properties: {
                results: { type: "array", items: { type: "object" } },
                unavailable: { type: "boolean" },
              },
            }),
            "401": unauthorizedResp,
          },
        },
      },
      "/favorites": {
        get: {
          tags: ["Favorites"],
          summary: "List pinned favorites and recent foods",
          responses: {
            "200": jsonResponse("Favorites and recent foods", {
              type: "object",
              properties: {
                favorites: { type: "array", items: { $ref: "#/components/schemas/Favorite" } },
                recent: { type: "array", items: { type: "object" } },
              },
            }),
            "401": unauthorizedResp,
          },
        },
        post: {
          tags: ["Favorites"],
          summary: "Save a favorite food",
          requestBody: jsonBody({ $ref: "#/components/schemas/Favorite" }),
          responses: {
            "201": jsonResponse("Saved favorite", {
              type: "object",
              properties: { favorite: { $ref: "#/components/schemas/Favorite" } },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/favorites/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        delete: {
          tags: ["Favorites"],
          summary: "Delete a favorite",
          responses: {
            "200": { description: "Deleted" },
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/templates": {
        get: {
          tags: ["Templates"],
          summary: "List meal templates",
          responses: {
            "200": jsonResponse("Templates", {
              type: "object",
              properties: { templates: { type: "array", items: { type: "object" } } },
            }),
            "401": unauthorizedResp,
          },
        },
        post: {
          tags: ["Templates"],
          summary: "Create a meal template",
          requestBody: jsonBody({
            type: "object",
            required: ["name", "items"],
            properties: {
              name: { type: "string" },
              items: { type: "array", items: { type: "object" } },
            },
          }),
          responses: {
            "201": jsonResponse("Created template", {
              type: "object",
              properties: { template: { type: "object" } },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/templates/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        delete: {
          tags: ["Templates"],
          summary: "Delete a meal template",
          responses: {
            "200": { description: "Deleted" },
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/templates/{id}/apply": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        post: {
          tags: ["Templates"],
          summary: "Log all items of a meal template to a day",
          requestBody: jsonBody({
            type: "object",
            required: ["date"],
            properties: { date: { type: "string", example: "2026-08-30" } },
          }),
          responses: {
            "200": jsonResponse("Applied count", {
              type: "object",
              properties: { applied: { type: "integer" } },
            }),
            "401": unauthorizedResp,
            "404": notFoundResp,
            "422": validationResp,
          },
        },
      },
      "/weight": {
        get: {
          tags: ["Weight"],
          summary: "List body-weight readings",
          description: "Defaults to the last 30 days. `unit` names the account's display unit.",
          parameters: [
            { name: "from", in: "query", required: false, schema: { type: "string", example: "2026-08-01" } },
            { name: "to", in: "query", required: false, schema: { type: "string", example: "2026-08-31" } },
          ],
          responses: {
            "200": jsonResponse("Weight readings", {
              type: "object",
              properties: {
                unit: { type: "string", enum: [...WEIGHT_UNITS] },
                logs: { type: "array", items: { $ref: "#/components/schemas/WeightLog" } },
              },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
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
              unit: { type: "string", enum: [...WEIGHT_UNITS] },
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
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/weight/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        delete: {
          tags: ["Weight"],
          summary: "Delete a body-weight reading",
          responses: {
            "200": { description: "Deleted" },
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/trends": {
        get: {
          tags: ["Summary"],
          summary: "Per-day totals over a window",
          parameters: [
            { name: "days", in: "query", required: false, schema: { type: "string", example: "30", default: "30" } },
            { name: "from", in: "query", required: false, schema: { type: "string", example: "2026-08-01" } },
            { name: "to", in: "query", required: false, schema: { type: "string", example: "2026-08-31" } },
          ],
          responses: {
            "200": jsonResponse("Trends over the window", { $ref: "#/components/schemas/Trends" }),
            "401": unauthorizedResp,
            "422": validationResp,
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
            "200": jsonResponse("Daily summary", { $ref: "#/components/schemas/Summary" }),
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/workouts": {
        get: {
          tags: ["Workouts"],
          summary: "Get workout for a day",
          parameters: [
            { name: "date", in: "query", required: true, schema: { type: "string", example: "2026-09-11" } },
          ],
          responses: {
            "200": jsonResponse("Workout details and exercise stats", {
              type: "object",
              properties: {
                workout: { type: ["object", "null"] },
                exerciseStats: { type: "object" },
              },
            }),
            "401": unauthorizedResp,
            "422": validationResp,
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
              source: { type: "string", enum: ["ui", "mcp"] },
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
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
        delete: {
          tags: ["Workouts"],
          summary: "Delete a workout by id or date",
          parameters: [
            { name: "id", in: "query", required: false, schema: { type: "string" } },
            { name: "date", in: "query", required: false, schema: { type: "string", example: "2026-09-11" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "400": jsonResponse("Missing id or date", errRef),
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
      "/workouts/dates": {
        get: {
          tags: ["Workouts"],
          summary: "List recent workout session dates and volumes",
          responses: {
            "200": jsonResponse("Workout sessions", {
              type: "object",
              properties: { sessions: { type: "array", items: { type: "object" } } },
            }),
            "401": unauthorizedResp,
          },
        },
      },
      "/workouts/export": {
        get: {
          tags: ["Workouts"],
          summary: "Export workouts as Obsidian markdown or JSON",
          parameters: [
            { name: "format", in: "query", required: false, schema: { type: "string", enum: ["markdown", "json"], default: "markdown" } },
            { name: "startDate", in: "query", required: false, schema: { type: "string", example: "2026-09-01" } },
            { name: "endDate", in: "query", required: false, schema: { type: "string", example: "2026-09-30" } },
          ],
          responses: {
            "200": { description: "Markdown or JSON workout export" },
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/workouts/import": {
        post: {
          tags: ["Workouts"],
          summary: "Import workouts from Obsidian markdown or structured array",
          requestBody: jsonBody({
            type: "object",
            properties: {
              markdown: { type: "string" },
              workouts: { type: "array", items: { type: "object" } },
              dryRun: { type: "boolean" },
              overwrite: { type: "boolean" },
            },
          }),
          responses: {
            "200": jsonResponse("Import result or dry-run preview", { type: "object" }),
            "401": unauthorizedResp,
            "422": validationResp,
          },
        },
      },
      "/workouts/summary": {
        get: {
          tags: ["Workouts"],
          summary: "Aggregate workout volume and muscle-group distribution",
          parameters: [
            { name: "days", in: "query", required: false, schema: { type: "integer", default: 30 } },
          ],
          responses: {
            "200": jsonResponse("Workout summary", {
              type: "object",
              properties: { summary: { type: "object" } },
            }),
            "401": unauthorizedResp,
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
            {
              name: "muscle",
              in: "query",
              required: false,
              schema: { type: "string", enum: [...MUSCLE_GROUPS] },
              description: "Filter by muscle group",
            },
          ],
          responses: {
            "200": jsonResponse("List of exercises", {
              type: "object",
              properties: {
                exercises: { type: "array", items: { type: "object" } },
              },
            }),
            "401": unauthorizedResp,
          },
        },
      },
      "/exercises/{id}/history": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        get: {
          tags: ["Workouts"],
          summary: "Get full session history and lifetime PRs for an exercise",
          responses: {
            "200": jsonResponse("Exercise history", { type: "object" }),
            "401": unauthorizedResp,
            "404": notFoundResp,
          },
        },
      },
    },
  };
}
