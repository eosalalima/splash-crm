import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";
import { invitationEmailConfig, sendInvitationEmail } from "../lib/email/invitations";

const env = {
  GMAIL_SMTP_USER: "sender@gmail.com",
  GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop",
  APP_URL: "https://crm.example.com",
};

test("Gmail invitations require app credentials and a trusted HTTPS origin", () => {
  assert.equal(invitationEmailConfig({}), null);
  assert.equal(invitationEmailConfig({ ...env, APP_URL: "http://localhost:3000" }), null);
  assert.equal(invitationEmailConfig({ ...env, APP_URL: "https://user:secret@example.com" }), null);
  assert.equal(invitationEmailConfig({ ...env, GMAIL_SMTP_USER: "sender\r\nInjected: header" }), null);
  assert.equal(invitationEmailConfig({ ...env, GMAIL_SMTP_APP_PASSWORD: "short" }), null);
  assert.deepEqual(invitationEmailConfig(env), {
    user: "sender@gmail.com", pass: "abcdefghijklmnop", origin: "https://crm.example.com",
  });
});

test("Gmail transport enforces TLS and composes an actual invitation message", async () => {
  const config = invitationEmailConfig(env)!;
  const invitation = { email: "member@example.com", token: "a".repeat(64), workspace: "Sales workspace", role: "manager" };
  const ids: string[] = [];
  await sendInvitationEmail(config, invitation, (options) => {
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.tls?.rejectUnauthorized, true);
    assert.deepEqual(options.auth, { user: config.user, pass: config.pass });
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    return {
      async sendMail(mail) {
        ids.push(String(mail.messageId));
        assert.ok(!String(mail.messageId).includes(invitation.token));
        const result = await composer.sendMail(mail);
        const message = result.message.toString();
        assert.ok(message.includes("From: Splash CRM <sender@gmail.com>"));
        assert.ok(message.includes("To: member@example.com"));
        assert.ok(String(mail.text).includes(`https://crm.example.com/invite/${invitation.token}`));
        assert.ok(String(mail.text).includes("Sales workspace as manager"));
        assert.ok(String(mail.text).includes("seven days"));
        assert.ok(String(mail.text).includes("verified email address member@example.com"));
        return { accepted: [invitation.email] };
      },
    };
  });
  await sendInvitationEmail(config, invitation, () => ({ async sendMail(mail) {
    assert.equal(mail.messageId, ids[0]);
    return { accepted: [invitation.email] };
  } }));
  await assert.rejects(sendInvitationEmail(config, invitation, () => ({ async sendMail() {
    return { accepted: [] };
  } })), /Invitation email delivery failed/);
  await assert.rejects(sendInvitationEmail(config, invitation, () => ({ async sendMail() {
    throw new Error("SMTP authentication failed");
  } })), /SMTP authentication failed/);
});
