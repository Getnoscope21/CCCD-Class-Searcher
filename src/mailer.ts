// Thin wrapper around nodemailer, configured entirely from env vars so the
// same code works for the live server's contact form and the scraper job's
// seat-alert notifications. Every consumer must check `isConfigured()` and
// no-op (not throw) when it's false -- SMTP setup is optional, matching how
// Supabase-backed features already degrade gracefully when unconfigured.

import nodemailer, { type Transporter } from "nodemailer";

export function isConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

let cachedTransporter: Transporter | null = null;
function transporter(): Transporter | null {
  if (!isConfigured()) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return cachedTransporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendMail(
  options: MailOptions,
): Promise<{ skipped: true } | { skipped: false }> {
  const t = transporter();
  if (!t) return { skipped: true };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await t.sendMail({ ...options, from });
  return { skipped: false };
}
