import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

const RESEND_URL = 'https://api.resend.com/emails';

// Two interchangeable transports, picked once at startup: Resend's HTTPS API
// when RESEND_API_KEY is set (takes priority - it's the one an operator
// opts into on purpose), otherwise plain SMTP when SMTP_HOST is set,
// otherwise email is off. Callers never know which one is behind send().
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private resendKey: string | null = null;
  private from: string;

  constructor() {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      this.resendKey = resendKey;
      // Resend only accepts a From on a domain verified in the account (or
      // its onboarding@resend.dev test sender) - SMTP_FROM works as a
      // fallback so one setting can serve either transport.
      this.from = process.env.RESEND_FROM || process.env.SMTP_FROM || 'Roost HQ <onboarding@resend.dev>';
      if (process.env.SMTP_HOST) this.logger.log('RESEND_API_KEY is set - sending through Resend, SMTP_HOST ignored');
      return;
    }

    const host = process.env.SMTP_HOST;
    this.from = process.env.SMTP_FROM || 'Roost HQ <noreply@example.com>';
    if (!host) {
      this.logger.warn('Neither RESEND_API_KEY nor SMTP_HOST set - email notifications disabled');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    // Doesn't block startup (a verified custom-domain "Send as" alias is a
    // real, valid setup this can't tell apart from a mistake) - just flags
    // the far more common mistake loudly, since nothing else ever will: the
    // send itself always reports success regardless (SMTP_HOST's own server
    // accepts and relays it), and the actual failure - the RECIPIENT's mail
    // server silently dropping it once its SPF/DKIM check on SMTP_FROM's
    // domain fails - produces no bounce, no error, nothing to log here.
    // See DEPLOY.md's SMTP section.
    const fromMatch = this.from.match(/<([^>]+)@([^>]+)>/) ?? this.from.match(/([^\s]+)@(\S+)/);
    const userDomain = process.env.SMTP_USER?.split('@')[1];
    if (fromMatch && userDomain && fromMatch[2].toLowerCase() !== userDomain.toLowerCase()) {
      this.logger.warn(
        `SMTP_FROM's domain (${fromMatch[2]}) doesn't match SMTP_USER's (${userDomain}) - emails will likely send ` +
          `"successfully" and then silently never arrive (SPF/DKIM failure on the recipient's end). See DEPLOY.md.`,
      );
    }
  }

  get enabled(): boolean {
    return !!this.transporter || !!this.resendKey;
  }

  // Best-effort, never throws - email is a convenience fallback, not core.
  // `html` is optional - most callers are plain-text system notices; pass it
  // for anything worth actually designing (currently just the invite email).
  // `body` still goes as the plain-text part either way, so a text-only
  // client (or a screen reader) always gets something readable.
  async send(to: string, subject: string, body: string, html?: string) {
    if (this.resendKey) return this.sendViaResend(to, subject, body, html);
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text: body, ...(html && { html }) });
    } catch (err) {
      this.logger.warn(`email send failed: ${(err as Error).message}`);
    }
  }

  private async sendViaResend(to: string, subject: string, body: string, html?: string) {
    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [to], subject, text: body, ...(html && { html }) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        // Resend's error body says exactly what's wrong (unverified domain,
        // bad key, rate limit) - the one thing worth keeping in the log.
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        this.logger.warn(`resend send failed: ${res.status} ${detail}`);
      }
    } catch (err) {
      this.logger.warn(`resend send failed: ${(err as Error).message}`);
    }
  }
}
