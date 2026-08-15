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
