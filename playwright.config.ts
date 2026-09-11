import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/visual.spec.ts",
  snapshotDir: "./tests/visual-snapshots",
  timeout: 30000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    },
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-light",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
      },
    },
    {
      name: "desktop-light",
      use: {
        viewport: { width: 1280, height: 800 },
        colorScheme: "light",
      },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
