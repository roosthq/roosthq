// Shared HTML shell for every email this app sends - one look (logo, card,
// heading, body, an optional button) instead of each caller inventing its
// own markup. Table-based layout + inline styles throughout on purpose: the
// one style of markup that survives Outlook's Word rendering engine as well
// as every modern client (Gmail, Apple Mail, etc.) - no <style> block, no
// flex/grid, nothing that degrades badly if stripped.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface EmailTemplateOptions {
  webUrl: string; // this instance's own public URL - logo is ${webUrl}/icon-192.png
  heading: string; // plain text, escaped here - the big line under the logo
  bodyHtml: string; // caller-built inner HTML (already escaped) - one or more <p> lines
  buttonText?: string; // omit either of these two to skip the button entirely
  buttonUrl?: string;
  footnote?: string; // small muted line under the button - plain text, escaped here
}

export function emailHtml(opts: EmailTemplateOptions): string {
  const logoUrl = `${opts.webUrl.replace(/\/+$/, '')}/icon-192.png`;
  const button =
    opts.buttonText && opts.buttonUrl
      ? `<tr>
              <td style="padding:28px 40px 8px;text-align:center;">
                <a href="${opts.buttonUrl}" style="display:inline-block;background:#4e7a4c;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;">${escapeHtml(opts.buttonText)}</a>
              </td>
            </tr>`
      : '';
  const footnote = opts.footnote
    ? `<tr>
              <td style="padding:16px 40px 36px;text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9a86;">${escapeHtml(opts.footnote)}</p>
              </td>
            </tr>`
    : '';
  const fallbackLink =
    opts.buttonText && opts.buttonUrl
      ? `<p style="margin:16px 0 0;font-size:11px;color:#a3b09e;">Trouble with the button? Copy this link: <a href="${opts.buttonUrl}" style="color:#8a9a86;">${opts.buttonUrl}</a></p>`
      : '';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;">
            <tr>
              <td style="padding:36px 40px 8px;text-align:center;">
                <img src="${logoUrl}" width="56" height="56" alt="Roost HQ" style="display:block;margin:0 auto 12px;border-radius:12px;" />
                <div style="font-size:14px;font-weight:700;color:#4e7a4c;letter-spacing:1px;">ROOST HQ</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0;text-align:center;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#22331e;">${escapeHtml(opts.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 40px 0;text-align:center;">
                <div style="font-size:15px;line-height:1.6;color:#4b5d47;">${opts.bodyHtml}</div>
              </td>
            </tr>
            ${button}
            ${footnote || (!footnote && !button ? '<tr><td style="padding-bottom:36px;"></td></tr>' : '')}
          </table>
          ${fallbackLink}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
