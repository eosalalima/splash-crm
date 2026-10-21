import { test, expect } from "@playwright/test";
test("capture lead, convert to opportunity, configure products, complete activity and review Customer 360", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4444/__test/reset", {
    data: { autoSession: true },
  });
  const email = "phase2-browser@example.com";
  await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
    data: { email },
  });
  const identity = await (
    await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
      data: { email, otp: "123456" },
    })
  ).json();
  await page.context().addCookies([
    {
      name: "__Secure-neon-auth.session_token",
      value: identity.token,
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
    },
  ]);
  await page.goto("/settings/catalog");
  await page.getByLabel("Name", { exact: true }).first().fill("Consulting");
  await page
    .getByLabel("Unit price (USD)", { exact: true })
    .first()
    .fill("150.25");
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await expect(
    page.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  const sources = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Lead sources", exact: true }),
  });
  await sources.getByLabel("Name", { exact: true }).fill("Referral");
  await sources
    .getByRole("button", { name: "Create source", exact: true })
    .click();
  await expect(
    sources.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  await page.goto("/leads/new");
  await page.getByLabel("Full name", { exact: true }).fill("Browser buyer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("buyer@example.com");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Browser account");
  await page
    .getByRole("combobox", { name: "Lead source", exact: true })
    .selectOption({ label: "Referral" });
  await page
    .getByLabel("Tags (comma separated)", { exact: true })
    .fill("pilot, priority");
  await page
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await expect(page).toHaveURL("/leads");
  await page
    .locator("a.record-name")
    .filter({ hasText: "Browser buyer" })
    .click();
  await expect(page).toHaveURL(/\/leads\/[\da-f-]+$/);
  const leadUrl = page.url();
  await page.getByRole("button", { name: "Convert lead", exact: true }).click();
  await expect(page).toHaveURL(/\/deals\/[\da-f-]+$/);
  const dealUrl = page.url();
  await page.getByLabel("Probability (%)", { exact: true }).fill("65");
  await page.getByLabel("Expected close", { exact: true }).fill("2026-12-15");
  await page.getByLabel("Value (USD)", { exact: true }).fill("300.50");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL("/deals");
  await page.goto(dealUrl);
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption({ label: "Consulting · $150.25" });
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(
    page.getByText("Consulting · 2 × $150.25 = $300.50", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Log activity", exact: true }).click();
  await page.getByLabel("Activity title", { exact: true }).fill("Buyer call");
  await page
    .getByRole("combobox", { name: "Activity type", exact: true })
    .selectOption("call");
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("completed");
  await page
    .getByLabel("Outcome", { exact: true })
    .fill("Buyer requested proposal");
  await page
    .getByLabel("Due date (UTC)", { exact: true })
    .fill("2026-11-01T09:00");
  await page
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await expect(page).toHaveURL("/activities");
  await page.goto(dealUrl);
  await expect(
    page.getByRole("link", { name: "Buyer call", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Buyer requested proposal/)).toBeVisible();
  await page.goto(leadUrl);
  await expect(
    page.getByRole("button", { name: "Convert lead", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Browser buyer opportunity", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Activities", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
