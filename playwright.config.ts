import { defineConfig, devices } from "@playwright/test";
// the test server's port: 3002, unless another project's server holds it (E2E_PORT=3012 npx playwright test …)
const PORT = process.env.E2E_PORT ?? "3002";
const ORIGIN = `http://127.0.0.1:${PORT}`;
// for a spec that checks a full address
process.env.E2E_ORIGIN = ORIGIN;
const appEnv = {
  NEXT_TEST_BUILD: "true",
  MONGODB_URI: "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local",
  APP_ORIGIN: ORIGIN,
  AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
  MOCK_OTP: "true",
  MOCK_OTP_CODE: "246810",
  // the shop assistant is hidden on the real site for now; the tests keep it working
  SHOP_ASSISTANT: "on",
  // the tests write to the database behind the app's back, so the shop cache keeps nothing
  SHOP_CACHE_SECONDS: "0",
  // fake credentials: the tests stop at Google's door, they never talk to Google
  GOOGLE_CLIENT_ID: "e2e-google-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  // blank on purpose: a real mailbox in .env must never email the fake test addresses
  SMTP_USER: "",
  SMTP_PASS: "",
  EMAIL_FROM: "",
  // blank on purpose: a Measurement ID in .env would count test runs as shoppers in Google Analytics
  GA_MEASUREMENT_ID: "",
  // push on, with a test-only key pair (never the real one in .env): the notifications card shows,
  // and no browser in the tests subscribes, so nothing is ever sent
  VAPID_PUBLIC_KEY: "BI1cqnabp8TQeZcNNuvRAoygMRSgktNBX0rYSqPaUXYClMRBwJLLikXrIu8YsE-bPLDF0JLu_0PIHQWyisebmiw",
  VAPID_PRIVATE_KEY: "DruF1vOjAneXX8Y4esKuyv_zGa9n8nirvjxdnFF7cG0",
};
/**
 * Every page's layout (layout.spec.ts only) on more Android screens: the narrowest phone, the most
 * common one, a wide one, a tablet, an opened foldable, and phones and tablets turned sideways.
 * About an hour, so only on request: SCREENS=android npx playwright test tests/e2e/layout.spec.ts
 */
const ANDROID_SCREENS = [
  "Galaxy S9+", // 320 wide: the narrowest phone in use
  "Galaxy S24", // 360 wide, tall: the most common Android shape
  "Galaxy A55", // 480 wide: big phones, or display size turned down
  "Galaxy Tab S9", // 640 wide: a tablet held upright still gets the phone layout
  "Galaxy Z Fold 7", // 984 × 1016: an opened foldable, nearly square
  "Pixel 7 landscape", // 863 × 360: a phone turned sideways, very little height
  "Galaxy S9+ landscape", // 658 × 320: the smallest phone sideways
  "Galaxy Tab S4 landscape", // 1138 × 712: a tablet sideways
] as const;
const androidProjects =
  process.env.SCREENS === "android"
    ? ANDROID_SCREENS.map((device) => ({
        name: `android-${device.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`,
        testMatch: /layout\.spec\.ts/,
        use: { ...devices[device] },
      }))
    : [];
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
    // no smooth scrolling (globals.css): a click finds its button, then presses and releases. If the page is still
    // gliding, the release can land off the button, and the click does nothing without any error or retry
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    ...androidProjects,
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT}`,
      url: `${ORIGIN}/login`,
      reuseExistingServer: false,
      env: appEnv,
      timeout: 120000, // a cold .next-e2e compile after large edits can take over a minute
    },
  ],
});
