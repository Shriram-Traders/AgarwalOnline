import { expect, it } from "vitest";
import { GET, POST } from "../src/app/api/auth/[...all]/route";

const origin = "http://127.0.0.1:3000/api/auth";

it("keeps Better Auth addresses the app never links to closed", async () => {
  for (const path of [
    "/phone-number/request-password-reset",
    "/phone-number/reset-password",
    "/phone-number/send-otp",
    "/phone-number/verify",
    "/sign-in/phone-number",
    "/sign-in/email",
    "/sign-up/email",
    "/change-password",
    "/update-user",
    "/list-sessions",
  ]) {
    const response = await POST(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status, path).toBe(404);
  }
  expect((await GET(new Request(`${origin}/get-session`))).status).toBe(404);
  expect((await GET(new Request(`${origin}/callback/google/../../sign-in/email`))).status).toBe(404);
});
