import { test, expect, type Page } from "@playwright/test";

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
    await page.goto("/?tab=workout&d=2026-09-30");
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
    await page.goto("/?tab=workout&d=2026-09-30");
    await page.waitForSelector('button:has-text("Chest, Delts, Triceps")');

    // Click "Push Day" starter template
    await page.locator('button:has-text("Chest, Delts, Triceps")').click();

    // Wait for the note editor and recognized exercise chips to load
    await expect(page.locator('textarea[aria-label="Workout note markdown"]')).toBeVisible();
    await expect(page.locator('text=Bench Press').first()).toBeVisible();

    // Take visual snapshot of note mode
    await takeFullPageScreenshot(page, "workout-note-mode.png");
  });

  test("Workout Tab - Interactive Cards Mode", async ({ page }) => {
    await page.goto("/?tab=workout&d=2026-09-30");
    await page.waitForSelector('button:has-text("Chest, Delts, Triceps")');

    // Load template
    await page.locator('button:has-text("Chest, Delts, Triceps")').click();
    await expect(page.locator('text=Bench Press').first()).toBeVisible();

    // Switch to Cards mode
    await page.locator('button[aria-label="Interactive Cards Mode"]').click();
    await expect(page.locator('text=Add Set').first()).toBeVisible();

    // Take visual snapshot of cards mode
    await takeFullPageScreenshot(page, "workout-cards-mode.png");
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
    await page.goto("/?tab=food&d=2026-09-30");
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

    // Take snapshot of Food tab
    await takeFullPageScreenshot(page, "food-tab.png");
  });

  test("Food Tab - Trends & Analysis Expanded View", async ({ page }) => {
    await page.goto("/?tab=food&d=2026-09-30");
    await page.waitForSelector("text=Trends & Analysis");

    // Click to expand Trends & Analysis accordion
    await page.locator("button:has-text('Trends & Analysis')").click();

    // Wait for TrendsCard content to load
    await page.waitForSelector('div[aria-label="Range"]');
    await expect(page.locator('div[aria-label="Range"]')).toBeVisible();

    // Take snapshot of expanded Trends & Analysis
    await takeFullPageScreenshot(page, "food-trends-expanded.png");
  });
});
