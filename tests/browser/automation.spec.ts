import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import * as schema from "../../lib/db/schema";
import { workspaceService } from "../../lib/domain/workspace";
import { crmService } from "../../lib/domain/crm";
import { funnelService } from "../../lib/domain/funnels";
import { automationWorker } from "../../lib/domain/automation-worker";

test("M4 typed workflow publication, worker effects, notification inbox, failures/replay and responsive controls", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await request.post("http://127.0.0.1:4444/__test/reset", {
    data: { autoSession: true },
  });
  const email = `m4-${randomUUID()}@example.com`;
  await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
    data: { email },
  });
  const identity = await (
    await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
      data: { email, otp: "123456" },
    })
  ).json();
  const url = process.env.PHASE1_TEST_DATABASE_URL!;
  expect(new URL(url).pathname).toMatch(/^\/splash_phase1_/);
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const db = drizzle(pool, { schema }),
      ws = workspaceService(db),
      funnels = funnelService(db),
      crm = crmService(db);
    const actor = identity.user;
    const org = await ws.createOrganization(actor, "M4 browser workspace");
    const fid = await funnels.create(actor, org, { name: "M4 browser funnel" });
    const version = await funnels.publish(actor, org, fid, {
      expectedRevision: 1,
      commandKey: randomUUID(),
    });
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
    await page.goto("/settings/automation");
    await expect(
      page.getByRole("heading", { name: "Automation", exact: true }),
    ).toBeVisible();
    await page.getByText("Configure a new workflow", { exact: true }).click();
    const form = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Publish workflow",
        exact: true,
      }),
    });
    await form
      .getByLabel("Workflow name", { exact: true })
      .fill("Browser follow-up");
    await form
      .getByRole("combobox", { name: "Published funnel version", exact: true })
      .selectOption(version.id);
    await form
      .getByRole("combobox", { name: "Entry stage", exact: true })
      .selectOption("lead");
    await form
      .getByRole("button", { name: "Add condition", exact: true })
      .click();
    await form
      .getByRole("combobox", { name: "Field", exact: true })
      .selectOption("status");
    await form
      .getByRole("combobox", { name: "Value", exact: true })
      .selectOption("open");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/m4-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await expect(
        form.getByRole("button", { name: "Publish workflow", exact: true }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: "test-results/m4-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await form
      .getByRole("button", { name: "Publish workflow", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText(
      "Workflow version published",
    );
    const deal = await crm.save(actor, org, "deals", {
      name: "M4 browser opportunity",
      value: "25",
      stage: "Lead",
      companyId: "",
    });
    await funnels.enroll(actor, org, {
      dealId: deal,
      versionId: version.id,
      commandKey: randomUUID(),
    });
    const worker = automationWorker(db);
    while (await worker.tick()) {}
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", {
        name: "An opportunity entered the configured stage.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mark as read", exact: true })
      .click();
    await expect(page.getByText(/Asia\/Manila.*Read/)).toBeVisible();
    await page.goto("/activities");
    await expect(
      page.getByRole("link", {
        name: "View Follow up on opportunity",
        exact: true,
      }),
    ).toBeVisible();
    const readerContext = await browser.newContext();
    // Separate simulated identity for negative UI checks.
    const readerEmail = `reader-${randomUUID()}@example.com`;
    await request.post("http://127.0.0.1:4444/auth/sign-up/email", {
      data: { email: readerEmail },
    });
    const reader = await (
      await request.post("http://127.0.0.1:4444/auth/email-otp/verify-email", {
        data: { email: readerEmail, otp: "123456" },
      })
    ).json();
    await ws.accept(
      reader.user,
      await ws.invite(actor, org, readerEmail, "read_only"),
    );
    await readerContext.addCookies([
      {
        name: "__Secure-neon-auth.session_token",
        value: reader.token,
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
      },
    ]);
    const readerPage = await readerContext.newPage();
    await readerPage.goto("/notifications");
    await expect(
      readerPage.getByText("No notifications available.", { exact: true }),
    ).toBeVisible();
    await readerPage.goto("/settings");
    await expect(
      readerPage.getByRole("link", { name: "Manage automation", exact: true }),
    ).toHaveCount(0);
    await readerContext.close();
    // Archive an already evaluated workflow to stop pending actions visibly.
    const second = await crm.save(actor, org, "deals", {
      name: "M4 second opportunity",
      value: "25",
      stage: "Lead",
      companyId: "",
    });
    await funnels.enroll(actor, org, {
      dealId: second,
      versionId: version.id,
      commandKey: randomUUID(),
    });
    const lease = (await worker.claim())!;
    await worker.prepare(lease);
    // Archive explicitly stops pending actions; failures remain visible and replayable.
    const rows = await db.select().from(schema.automations);
    const workflow = rows.find((r) => r.organizationId === org)!;
    const { automationService } = await import("../../lib/domain/automation");
    await automationService(db).archive(actor, org, workflow.id);
    try {
      await worker.process(lease);
    } catch (error) {
      await worker.fail(lease, error);
    }
    // Already pinned actions fail closed, and the operator can queue controlled replay.
    await page.goto("/settings/automation");
    await expect(
      page.getByRole("heading", { name: /Browser follow-up.*Archived/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Action history", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText("Workflow was archived; pending actions are stopped.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Replay failed event", exact: true })
      .click();
    await expect(page.locator("article").filter({hasText: `Event ${lease.id} · Transition`}).getByRole("heading")).toContainText("pending");
    expect(errors).toEqual([]);
  } finally {
    await pool.end();
  }
});
