import { test, expect } from "@playwright/test";

test("workspace administration, invitation, read-only access, audit, mobile navigation and membership revocation", async ({
  page,
  browser,
  request,
}) => {
  await request.post("http://127.0.0.1:4444/__test/reset", {
    data: { autoSession: true },
  });
  async function identity(
    email: string,
  ): Promise<{ token: string; user: { id: string; email: string } }> {
    await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
      data: { email },
    });
    return (
      await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
        data: { email, otp: "123456" },
      })
    ).json();
  }
  const admin = await identity("phase1-admin@example.com");
  const reader = await identity("phase1-reader@example.com");
  const cookie = (token: string) => ({
    name: "__Secure-neon-auth.session_token",
    value: token,
    domain: "localhost",
    path: "/",
    secure: true,
    httpOnly: true,
  });
  await page.context().addCookies([cookie(admin.token)]);
  await page.goto("/settings/workspace");
  await expect(
    page.getByRole("heading", {
      name: "Workspace administration",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Team name").fill("Sales team");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByText("Workspace updated.", { exact: true }),
  ).toBeVisible();
  const invitation = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Create invitation", exact: true }),
    });
  await invitation.locator("input[name=email]").fill(reader.user.email);
  await invitation.locator("select[name=role]").selectOption("read_only");
  await invitation
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(invitation.locator(".invitation-link")).toBeVisible();
  const path = await invitation
    .locator(".invitation-link")
    .getAttribute("href");
  await page.goto("/companies/new");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Phase 1 browser company");
  await page
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await expect(page).toHaveURL("/companies");
  await expect(
    page
      .locator("a.record-name")
      .filter({ hasText: "Phase 1 browser company" }),
  ).toBeVisible();
  const readerContext = await browser.newContext();
  try {
    await readerContext.addCookies([cookie(reader.token)]);
    const readerPage = await readerContext.newPage();
    await readerPage.goto(`http://localhost:3100${path}`);
    await readerPage
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(readerPage).toHaveURL("http://localhost:3100/dashboard");
    await readerPage.goto("http://localhost:3100/companies");
    await expect(
      readerPage
        .locator("a.record-name")
        .filter({ hasText: "Phase 1 browser company" }),
    ).toBeVisible();
    await expect(
      readerPage.getByRole("link", { name: "Add company", exact: true }),
    ).toHaveCount(0);
    await page.goto("/settings/audit");
    await expect(
      page.getByRole("heading", { name: "Audit history", exact: true }),
    ).toBeVisible();
    await expect(page.locator("tbody")).toContainText("record.created");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Settings", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/settings/workspace");
    const member = page
      .locator("form")
      .filter({
        has: page.locator(`input[name=userId][value="${reader.user.id}"]`),
      })
      .first();
    await member.locator("select[name=revoke]").selectOption("yes");
    await member
      .getByRole("button", { name: "Update member", exact: true })
      .click();
    await expect(member).toHaveCount(0);
    await readerPage.reload();
    await expect(readerPage).toHaveURL("http://localhost:3100/workspaces");
    await expect(
      readerPage.getByRole("heading", { name: "Your workspaces", exact: true }),
    ).toBeVisible();
    await expect(
      readerPage
        .locator("a.record-name")
        .filter({ hasText: "Phase 1 browser company" }),
    ).toHaveCount(0);
  } finally {
    await readerContext.close();
  }
});
