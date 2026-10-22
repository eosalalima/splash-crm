import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../lib/db/schema";
import { workspaceService } from "../../lib/domain/workspace";

test("M3 designer, immutable publication, enrollment, keyboard/stale-command/drag movement, reasons, history and read-only board", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1920, height: 1200 });
  await request.post("http://127.0.0.1:4444/__test/reset", {
    data: { autoSession: true },
  });
  async function identity(email: string) {
    await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
      data: { email },
    });
    return (
      await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
        data: { email, otp: "123456" },
      })
    ).json();
  }
  const admin = await identity("m3-admin@example.com"),
    reader = await identity("m3-reader@example.com");
  const cookie = (token: string) => ({
    name: "__Secure-neon-auth.session_token",
    value: token,
    domain: "localhost",
    path: "/",
    secure: true,
    httpOnly: true,
  });
  await page.context().addCookies([cookie(admin.token)]);
  await page.goto("/funnels");
  await page
    .getByLabel("New funnel name", { exact: true })
    .fill("M3 standard sales");
  await page
    .getByRole("button", { name: "Create funnel", exact: true })
    .click();
  await expect(page).toHaveURL(/\/funnels\/[\da-f-]+$/);
  const designerUrl = page.url();
  const designer = page.locator(".funnel-designer");
  const designerForm = designer.locator(".funnel-designer-form");
  const desktopWidth = await designerForm.evaluate((form) => form.getBoundingClientRect().width);
  expect(desktopWidth).toBeGreaterThan(1000);
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await designer.evaluate((panel) => panel.scrollWidth > panel.clientWidth)).toBe(false);
    await expect(page.getByLabel("Funnel name", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Stage name", { exact: true })).toBeVisible();
  }
  await page.getByRole("combobox", { name: "Designer layout", exact: true }).selectOption("vertical");
  expect(await designer.locator(".funnel-preview").evaluate((preview) => preview.scrollWidth > preview.clientWidth)).toBe(false);
  await page.getByRole("combobox", { name: "Designer layout", exact: true }).selectOption("horizontal");
  await page.screenshot({ path: "/tmp/splash-designer-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.screenshot({ path: "/tmp/splash-designer-desktop.png", fullPage: true });
  await expect(
    page.getByRole("button", { name: "3. Proposal · 60%", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  const v1 = page.getByRole("link", {
    name: "Version 1 · view pinned pipeline",
    exact: true,
  });
  await expect(v1).toBeVisible();
  const boardPath = (await v1.getAttribute("href"))!;
  await page.goto("/deals/new");
  await page
    .getByLabel("Opportunity name", { exact: true })
    .fill("M3 browser opportunity");
  await page.getByLabel("Value (USD)", { exact: true }).fill("25000");
  await page
    .getByRole("button", { name: "Create record", exact: true })
    .click();
  await expect(page).toHaveURL("/deals");
  await page
    .locator("a.record-name")
    .filter({ hasText: "M3 browser opportunity" })
    .click();
  await expect(page).toHaveURL(/\/deals\/[\da-f-]+$/);
  const dealUrl = page.url();
  await page
    .getByRole("combobox", { name: "Published funnel version", exact: true })
    .selectOption({ label: "M3 standard sales · v1" });
  await page
    .getByRole("button", { name: "Enroll opportunity", exact: true })
    .click();
  await expect(page).toHaveURL(/\/journeys\/[\da-f-]+$/);
  const journeyUrl = page.url();
  await page
    .getByRole("link", { name: "Open pinned pipeline", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/pipeline\\?version="));
  let card = page
    .locator(".journey-card")
    .filter({ hasText: "M3 browser opportunity" });
  await card.getByRole("combobox", { name: "Move to", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await card
    .getByRole("combobox", { name: "Move to", exact: true })
    .selectOption("qualified");
  await card.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.locator(
      '.pipeline-column[aria-label="Qualified stage"] .journey-card',
    ),
  ).toContainText("M3 browser opportunity");
  card = page.locator(
    '.pipeline-column[aria-label="Qualified stage"] .journey-card',
  );
  // Submit an outdated client revision; PostgreSQL tests cover simultaneous clients.
  await card.locator('input[name="expectedRevision"]').evaluate((input) => {
    (input as HTMLInputElement).value = "1";
  });
  await card.getByRole("button", { name: "Move", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("changed");
  await card.locator('input[name="expectedRevision"]').evaluate((input) => {
    (input as HTMLInputElement).value = "2";
  });
  await card.getByRole("button", { name: "Move", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Expected close date");
  await page.goto(dealUrl);
  await page.getByLabel("Expected close", { exact: true }).fill("2026-12-15");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL("/deals");
  await page.goto(`http://localhost:3100${boardPath}`);
  await page
    .locator('.pipeline-column[aria-label="Qualified stage"] .journey-card')
    .getByRole("button", { name: "Move", exact: true })
    .click();
  await expect(
    page.locator('.pipeline-column[aria-label="Proposal stage"] .journey-card'),
  ).toContainText("M3 browser opportunity");
  card = page.locator(
    '.pipeline-column[aria-label="Proposal stage"] .journey-card',
  );
  await card
    .getByRole("button", { name: "Drag M3 browser opportunity", exact: true })
    .dragTo(page.locator('.pipeline-column[aria-label="Lost stage"]'), {
      sourcePosition: { x: 20, y: 15 },
      targetPosition: { x: 30, y: 30 },
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Destination Lost selected" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Move", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText(
    "configured outcome reason",
  );
  await expect(
    card.getByRole("combobox", { name: "Move to", exact: true }),
  ).toHaveValue("lost");
  await card
    .getByRole("combobox", {
      name: "Outcome reason (required for unsuccessful exit)",
      exact: true,
    })
    .selectOption("Budget withdrawn");
  await card.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.locator('.pipeline-column[aria-label="Lost stage"] .journey-card'),
  ).toContainText("journey unsuccessful");
  await page.screenshot({ path: "/tmp/splash-m3-board.png", fullPage: true });
  await page.goto(journeyUrl);
  await expect(
    page.getByText("Reason: Budget withdrawn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Opportunity status is independently open/),
  ).toBeVisible();
  await page.goto(designerUrl);
  await page
    .getByRole("button", { name: "3. Proposal · 60%", exact: true })
    .click();
  await page.getByLabel("Stage name", { exact: true }).fill("Offer");
  await expect(
    page.getByRole("button", { name: "Publish saved draft", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Publish saved draft", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Version 2 · view pinned pipeline",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`http://localhost:3100${boardPath}`);
  await expect(
    page.locator('.pipeline-column[aria-label="Proposal stage"]'),
  ).toBeVisible();
  await expect(
    page.locator('.pipeline-column[aria-label="Offer stage"]'),
  ).toHaveCount(0);
  // Re-enroll explicitly after a terminal journey, then verify a read-only member sees it without controls.
  await page.goto(dealUrl);
  await page
    .getByRole("combobox", { name: "Published funnel version", exact: true })
    .selectOption({ label: "M3 standard sales · v2" });
  await page
    .getByRole("button", { name: "Enroll opportunity", exact: true })
    .click();
  await expect(page).toHaveURL(/\/journeys\/[\da-f-]+$/);
  const activeBoardPath = (await page
    .getByRole("link", { name: "Open pinned pipeline", exact: true })
    .getAttribute("href"))!;
  const pool = new Pool({
    connectionString: process.env.PHASE1_TEST_DATABASE_URL,
  });
  try {
    const ws = workspaceService(drizzle(pool, { schema }));
    const [org] = await ws.available(
      { ...admin.user, emailVerified: true },
      false,
    );
    await ws.accept(
      { ...reader.user, emailVerified: true },
      await ws.invite(
        { ...admin.user, emailVerified: true },
        org.id,
        reader.user.email,
        "read_only",
      ),
    );
  } finally {
    await pool.end();
  }
  const context = await browser.newContext();
  try {
    await context.addCookies([cookie(reader.token)]);
    const observer = await context.newPage();
    await observer.goto(`http://localhost:3100${activeBoardPath}`);
    await expect(observer.locator(".journey-card")).toContainText(
      "M3 browser opportunity",
    );
    await expect(
      observer.getByRole("button", { name: "Move", exact: true }),
    ).toHaveCount(0);
    await observer.goto(designerUrl);
    await expect(
      observer.getByRole("button", {
        name: "Publish saved draft",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      observer.getByLabel("Stage name", { exact: true }),
    ).toBeDisabled();
  } finally {
    await context.close();
  }
  await page.goto(`http://localhost:3100${activeBoardPath}`);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Pipeline", exact: true }),
  ).toBeVisible();
});
