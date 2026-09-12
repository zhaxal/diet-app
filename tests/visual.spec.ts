import { test, expect, type Page } from "@playwright/test";

// Keep visual fixtures on a genuinely selectable day. Future URL dates are
// intentionally normalized by the app so the week navigator never loses its
// active cell.
const EMPTY_DAY = "2026-09-01";

async function authenticate(page: Page) {
  // Login as demo user
  const res = await page.request.post("http://localhost:3000/api/auth/login", {
    data: {
      email: "demo@example.com",
      password: "password123",
    },
  });
  const data = await res.json();
  if (data.token) {
    await page.context().addCookies([
      {
        name: "diet_token",
        value: data.token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  // Disable Next.js dev indicator badge in test server
  await page.request.post("http://localhost:3000/__nextjs_disable_dev_indicator").catch(() => {});
}

async function takeFullPageScreenshot(page: Page, snapshotName: string) {
  // In Playwright, position: fixed elements freeze at the initial viewport height (y=844px),
  // causing the bottom nav and floating toast snackbars to freeze across the middle of stitched fullPage screenshots.
  // Dock the nav statically at the bottom of the content flow and hide floating toast overlays so full-page images read cleanly.
  await page.addStyleTag({
    content: `
      nav[aria-label="Bottom navigation"] {
        position: static !important;
      }
      div.pb-32 {
        padding-bottom: 1.5rem !important;
      }
      [data-toast-container],
      div:has(> [role="status"]),
      div:has(> [role="alert"]),
      [role="status"],
      [role="alert"],
      nextjs-portal,
      [data-nextjs-dev-tools-portal],
      [data-next-badge] {
        display: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((p) => {
      (p as HTMLElement).style.setProperty("display", "none", "important");
      p.remove();
    });
  });
  await expect(page).toHaveScreenshot(snapshotName, { fullPage: true });
}

test.describe("Visual Regression Tests", () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("Workout Tab - Empty State & Routine Starters", async ({ page }) => {
    // Navigate to a clean date with no logged workout
    await page.goto(`/?tab=workout&d=${EMPTY_DAY}`);
    await page.waitForSelector("text=No workout logged");
    await expect(page.locator("text=Choose a routine starter")).toBeVisible();

    // Verify all 6 routine starters are rendered using subtitle identifiers
    await expect(page.locator('button:has-text("Chest, Delts, Triceps")')).toBeVisible();
    await expect(page.locator('button:has-text("Back, Biceps, Rear Delts")')).toBeVisible();
    await expect(page.locator('button:has-text("Quads, Hamstrings, Calves")')).toBeVisible();
    await expect(page.locator('button:has-text("Press, Row, Pull-up, Arms")')).toBeVisible();
    await expect(page.locator('button:has-text("Squat, Hinge, Single Leg")')).toBeVisible();
    await expect(page.locator('button:has-text("Compound Essentials")')).toBeVisible();

    // Take visual snapshot of the empty state
    await takeFullPageScreenshot(page, "workout-empty-state.png");
  });

  test("Workout Tab - Note Mode with Loaded Routine", async ({ page }) => {
    await page.goto(`/?tab=workout&d=${EMPTY_DAY}`);
    await page.waitForSelector('button:has-text("Chest, Delts, Triceps")');

    // Click "Push Day" starter template
    await page.locator('button:has-text("Chest, Delts, Triceps")').click();

    // Wait for the note editor and recognized exercise chips to load
    await expect(page.locator('textarea[aria-label="Workout note markdown"]')).toBeVisible();
    await expect(page.locator('text=Bench Press').first()).toBeVisible();

    // Take visual snapshot of note mode
    await takeFullPageScreenshot(page, "workout-note-mode.png");
  });

  test("Workout Tab - Add Exercise Dialog", async ({ page }) => {
    await page.goto(`/?tab=workout&d=${EMPTY_DAY}`);
    await page.waitForSelector('button:has-text("Chest, Delts, Triceps")');

    // Load template
    await page.locator('button:has-text("Chest, Delts, Triceps")').click();
    await expect(page.locator('text=Bench Press').first()).toBeVisible();

    // Cards mode is gone; exercise selection is now a focused dialog.
    await expect(page.locator('button[aria-label="Interactive Cards Mode"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Add exercise from database" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Exercise" });
    await expect(dialog).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search exercises" });
    await expect(search).toBeFocused();

    // The catalog search is debounced. Pin the dialog to a specific settled
    // response so the screenshot never races its initial empty-list state.
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/exercises" && url.searchParams.get("q") === "bench";
    });
    await search.fill("bench");
    await searchResponse;
    await expect(dialog.getByRole("button", { name: /Close-Grip Bench Press/ })).toBeVisible();
    // The row beneath the keyboard pointer can otherwise pick up a transient
    // hover treatment from the preceding test action and make the baseline
    // depend on where Playwright last moved the mouse.
    await page.mouse.move(0, 0);

    await expect(dialog).toHaveScreenshot("workout-add-exercise-dialog.png", {
      animations: "disabled",
    });
  });

  test("Settings Tab - Clean MCP & Consolidated Import/Export", async ({ page }) => {
    await page.goto("/?tab=settings");
    await page.waitForSelector("text=AI Assistant / MCP connector");

    // Verify MCP URL box is visible
    await expect(page.locator("text=AI Assistant / MCP connector")).toBeVisible();

    // Verify Client configurations block is NOT present
    await expect(page.locator("text=Client configurations")).toHaveCount(0);

    // Verify Import & Export section is present with JSON, CSV, Vault, and Import buttons
    await expect(page.locator("text=Import & Export")).toBeVisible();
    await expect(page.locator("text=JSON Backup")).toBeVisible();
    await expect(page.locator("text=CSV Entries")).toBeVisible();
    await expect(page.locator("text=Vault (.md)")).toBeVisible();
    await expect(page.locator("text=Import Workouts (Markdown)")).toBeVisible();

    // Verify Nested TDEE Calculator disclosure button is present inside Daily Goals
    await expect(page.locator("text=Calculate from TDEE / Profile")).toBeVisible();

    // Verify standalone Calculate goals panel is NOT present
    await expect(page.locator("text=Calculate goals")).toHaveCount(0);

    // Rare irreversible actions use a proper alert dialog.
    await page.getByRole("button", { name: "Regenerate key" }).click();
    const keyDialog = page.getByRole("alertdialog", { name: "Regenerate connector key?" });
    await expect(keyDialog).toBeVisible();
    await expect(keyDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(keyDialog).toBeHidden();

    // Bulk import uses the same accessible dialog foundation.
    await page.getByRole("button", { name: "Import Workouts (Markdown)" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import Workouts" });
    await expect(importDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(importDialog).toBeHidden();

    // Take visual snapshot of settings tab
    await takeFullPageScreenshot(page, "settings-tab.png");
  });

  test("Settings Tab - Nested TDEE Calculator Expanded", async ({ page }) => {
    await page.goto("/?tab=settings");
    await page.waitForSelector("text=Calculate from TDEE / Profile");

    // Click to expand nested TDEE calculator
    await page.locator("button:has-text('Calculate from TDEE / Profile')").click();

    // Verify calculator inputs and formula note
    await expect(page.locator("text=Mifflin–St Jeor maintenance estimate")).toBeVisible();
    await expect(page.locator("text=Activity")).toBeVisible();

    // Take snapshot of expanded calculator inside Daily Goals
    await takeFullPageScreenshot(page, "settings-tdee-expanded.png");
  });

  test("Food Tab - Daily Logging with Contextual Weight and Trends Accordion", async ({ page }) => {
    await page.goto(`/?tab=food&d=${EMPTY_DAY}`);
    await page.waitForSelector("text=Calories");

    // Verify 3-tab bottom navigation
    const bottomNav = page.locator('nav[aria-label="Bottom navigation"]');
    await expect(bottomNav.locator("text=Food")).toBeVisible();
    await expect(bottomNav.locator("text=Workout")).toBeVisible();
    await expect(bottomNav.locator("text=Settings")).toBeVisible();
    await expect(bottomNav.locator("text=Today")).toHaveCount(0);
    await expect(bottomNav.locator("text=Trends")).toHaveCount(0);
    await expect(bottomNav.locator("text=Weight")).toHaveCount(0);

    // Verify Weight instrument is placed on Food page
    await expect(page.locator("text=Weight").first()).toBeVisible();

    // Verify Trends & Analysis collapsible panel is present
    await expect(page.locator("text=Trends & Analysis")).toBeVisible();
    await expect(page.getByRole("button", { name: /Open food composer/ })).toBeVisible();

    // Take snapshot of Food tab
    await takeFullPageScreenshot(page, "food-tab.png");
  });

  test("Food Tab - Manual Entry Dialog", async ({ page }) => {
    await page.goto(`/?tab=food&d=${EMPTY_DAY}`);
    await page.getByRole("button", { name: /Open food composer/ }).click();
    await page.getByRole("button", { name: "Enter food manually" }).click();

    const dialog = page.getByRole("dialog", { name: "Manual Food Entry" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Meal" })).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: "Food" })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Calories (kcal)" })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Protein g" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "+ Protein, carbs & fat" })).toBeVisible();
    const asEaten = dialog.getByRole("button", { name: "As eaten" });
    const perHundred = dialog.getByRole("button", { name: "PER 100 G" });
    await expect(asEaten).toHaveAttribute("aria-pressed", "true");
    await expect(perHundred).toHaveAttribute("aria-pressed", "false");

    await expect(dialog).toHaveScreenshot("food-manual-entry-dialog.png", {
      animations: "disabled",
    });

    await perHundred.click();
    await expect(perHundred).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("spinbutton", { name: "Amount to log" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Food Tab - Trends & Analysis Expanded View", async ({ page }) => {
    await page.goto(`/?tab=food&d=${EMPTY_DAY}`);
    await page.waitForSelector("text=Trends & Analysis");

    // Click to expand Trends & Analysis accordion
    await page.locator("button:has-text('Trends & Analysis')").click();

    // Wait for TrendsCard content to load
    await page.waitForSelector('div[aria-label="Range"]');
    await expect(page.locator('div[aria-label="Range"]')).toBeVisible();

    // Take snapshot of expanded Trends & Analysis
    await takeFullPageScreenshot(page, "food-trends-expanded.png");
  });

  test("Food Tab - Quick add logs immediately with Undo", async ({ page }) => {
    await page.goto("/?tab=food");
    const favorite = await page.evaluate(async () => {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Instant test food",
          calories: 123,
          protein: 9,
          carbs: 8,
          fat: 4,
          fiber: 2,
          sugar: 1,
          sodium: 45,
          mealType: "snack",
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ favorite: { id: string } }>;
    });

    try {
      await page.reload();
      const quickAdd = page.getByRole("button", {
        name: /Log Instant test food, 123 calories, to (breakfast|lunch|dinner|snack)/,
      });
      await expect(quickAdd).toBeVisible();
      await quickAdd.click();

      await expect(page.getByRole("status")).toContainText("Added Instant test food");
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByRole("button", { name: "Undo" })).toBeHidden();
    } finally {
      await page.evaluate(async (id) => {
        await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      }, favorite.favorite.id);
    }
  });

  test("Food Tab - Quick add filter hands its query to search", async ({ page }) => {
    await page.goto("/?tab=food");
    const favorite = await page.evaluate(async () => {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Filter handoff food",
          calories: 111,
          protein: 7,
          carbs: 6,
          fat: 3,
          fiber: 1,
          sugar: 1,
          sodium: 20,
          mealType: "lunch",
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ favorite: { id: string } }>;
    });

    try {
      await page.reload();
      const filter = page.getByRole("textbox", { name: "Find food" });
      await expect(filter).toBeVisible();
      await filter.fill("Filter handoff");
      await expect(page.getByRole("button", { name: /Log Filter handoff food/ })).toBeVisible();
      await page.getByRole("button", { name: "Search all foods →" }).click();

      const search = page.getByRole("textbox", { name: "Search foods" });
      await expect(search).toHaveValue("Filter handoff");
      await expect(search).toBeFocused();
    } finally {
      await page.evaluate(async (id) => {
        await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      }, favorite.favorite.id);
    }
  });

  test("Food Tab - Historical quick add requires an explicit meal", async ({ page }) => {
    await page.goto(`/?tab=food&d=${EMPTY_DAY}`);
    const favorite = await page.evaluate(async () => {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Historical meal test food",
          calories: 135,
          protein: 8,
          carbs: 9,
          fat: 5,
          fiber: 2,
          sugar: 1,
          sodium: 50,
          mealType: "dinner",
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ favorite: { id: string } }>;
    });

    try {
      await page.reload();
      const quickAdd = page.getByRole("button", {
        name: /Choose a meal before logging Historical meal test food, 135 calories/,
      });
      await quickAdd.click();

      const chooser = page.getByRole("group", { name: "Choose a meal for Historical meal test food" });
      await expect(chooser).toBeVisible();
      await expect(chooser.getByRole("button", { name: /^breakfast$/i })).toBeFocused();
      const entryRequest = page.waitForRequest((request) =>
        new URL(request.url()).pathname === "/api/entries" && request.method() === "POST",
      );
      await chooser.getByRole("button", { name: /^breakfast$/i }).click();
      const request = await entryRequest;
      expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({ mealType: "breakfast" });

      await expect(page.getByRole("status")).toContainText("Added Historical meal test food to breakfast");
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByRole("button", { name: "Undo" })).toBeHidden();
    } finally {
      await page.evaluate(async (id) => {
        await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      }, favorite.favorite.id);
    }
  });

  test("Food Tab - Future deep link is clamped to a selectable day", async ({ page }) => {
    const browserToday = await page.evaluate(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    });

    await page.goto("/?tab=food&d=2099-01-01");
    await expect.poll(() => new URL(page.url()).searchParams.get("d")).toBe(browserToday);
    await expect(page.locator('input[type="date"]').first()).toHaveValue(browserToday);
  });
});
