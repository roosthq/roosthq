import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.SMTP_FROM || 'Roost HQ <noreply@example.com>';
    if (!host) {
      this.logger.warn('SMTP_HOST not set - email notifications disabled');
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
    return !!this.transporter;
  }

  // Best-effort, never throws - email is a convenience fallback, not core.
  // `html` is optional - most callers are plain-text system notices; pass it
  // for anything worth actually designing (currently just the invite email).
  // `body` still goes as the plain-text part either way, so a text-only
  // client (or a screen reader) always gets something readable.
  async send(to: string, subject: string, body: string, html?: string) {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text: body, ...(html && { html }) });
    } catch (err) {
      this.logger.warn(`email send failed: ${(err as Error).message}`);
    }
  }
}
