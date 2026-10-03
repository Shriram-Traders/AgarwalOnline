import { defineConfig, devices } from "@playwright/test";
const appEnv = {
  NEXT_TEST_BUILD: "true",
  MONGODB_URI: "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local",
  APP_ORIGIN: "http://127.0.0.1:3002",
  AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
  MOCK_OTP: "true",
  MOCK_OTP_CODE: "246810",
  // the shop assistant is hidden on the real site for now; the tests keep it working
  SHOP_ASSISTANT: "on",
  // fake credentials: the tests stop at Google's door, they never talk to Google
  GOOGLE_CLIENT_ID: "e2e-google-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  // blank on purpose: a real Resend key in .env must never email the fake test addresses
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
};
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3002", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 3002",
      url: "http://127.0.0.1:3002/login",
      reuseExistingServer: false,
      env: appEnv,
      timeout: 120000, // a cold .next-e2e compile after large edits can take over a minute
    },
  ],
});
