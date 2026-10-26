import { createHash } from "node:crypto";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { z } from "zod";

export function invitationEmailConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const user = env.GMAIL_SMTP_USER?.trim();
  // Google displays app passwords in groups of four characters.
  const pass = env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (
    !user ||
    !z.email().safeParse(user).success ||
    !pass ||
    pass.length !== 16 ||
    !env.APP_URL
  )
    return null;
  try {
    const url = new URL(env.APP_URL);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { user, pass, origin: url.origin };
  } catch {
    return null;
  }
}

type MailerFactory = (options: SMTPTransport.Options) => {
  sendMail: (mail: SendMailOptions) => Promise<{ accepted: unknown[] }>;
};

export async function sendInvitationEmail(
  config: NonNullable<ReturnType<typeof invitationEmailConfig>>,
  invitation: { email: string; token: string; workspace: string; role: string },
  createMailer: MailerFactory = (options) => nodemailer.createTransport(options),
) {
  const url = new URL(`/invite/${invitation.token}`, config.origin).href;
  const mailer = createMailer({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  const result = await mailer.sendMail({
    from: { name: "Splash CRM", address: config.user },
    to: { address: invitation.email, name: "" },
    subject: "You're invited to a Splash CRM workspace",
    messageId: `<invite-${createHash("sha256").update(invitation.token).digest("hex")}@${new URL(config.origin).hostname}>`,
    text: `You've been invited to ${invitation.workspace} as ${invitation.role}.\n\nAccept your invitation:\n${url}\n\nThis link expires in seven days. Sign in with the verified email address ${invitation.email}. If you weren't expecting this invitation, you can ignore this email.`,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  if (!result.accepted.length) throw new Error("Invitation email delivery failed.");
}
