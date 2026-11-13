import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "docs/e2e-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    {
      name: "mobile-webkit",
      use: {
        ...devices["iPhone 13"],
        launchOptions: process.env.WEBKIT_EXECUTABLE
          ? { executablePath: process.env.WEBKIT_EXECUTABLE }
          : undefined,
      },
    },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
