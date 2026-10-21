import { test, expect } from "@playwright/test";

test("both Add activity links open the standalone form and create an unlinked activity", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4444/__test/reset", {
    data: { autoSession: true },
  });
  const email = "activity-browser@example.com";
  await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
    data: { email },
  });
  const identity = await (
    await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
      data: { email, otp: "123456" },
    })
  ).json();
  await page
    .context()
    .addCookies([
      {
        name: "__Secure-neon-auth.session_token",
        value: identity.token,
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
      },
    ]);
  await page.goto("/activities");
  const links = page.getByRole("link", { name: "Add activity", exact: true });
  await expect(links).toHaveCount(2);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/activities/new**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await links.last().click();
    await expect(page.getByText("Opening…", { exact: true })).toBeVisible();
  } finally {
    release();
  }

  await expect(page).toHaveURL("/activities/new");
  await expect(
    page.getByRole("heading", { name: "New activity", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL("/activities");
  await page
    .getByRole("link", { name: "Add activity", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/activities/new");
  await page
    .getByLabel("Activity title", { exact: true })
    .fill("Standalone follow-up");
  await page
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await expect(page).toHaveURL("/activities");
  await expect(
    page.locator("a.record-name").filter({ hasText: "Standalone follow-up" }),
  ).toBeVisible();
});
