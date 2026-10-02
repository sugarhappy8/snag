import type { Env } from './types';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/**
 * Sends through Resend (https://resend.com/docs/api-reference). Uses the batch endpoint for
 * multiple messages so a cron run spends one subrequest per 100 emails.
 * Without RESEND_API_KEY (local dev) emails are printed to the console instead.
 */
export async function sendEmails(env: Env, messages: EmailMessage[]): Promise<void> {
  if (!messages.length) return;
  if (!env.RESEND_API_KEY) {
    for (const m of messages) console.log(`[email:dev] to=${m.to} subject=${m.subject}\n${m.text}`);
    return;
  }
  const body = (m: EmailMessage) => ({ from: env.FROM_EMAIL, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers });
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const single = chunk.length === 1;
    const res = await fetch(`https://api.resend.com/emails${single ? '' : '/batch'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(single ? body(chunk[0]) : chunk.map(body)),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

const shell = (inner: string) => `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16161d">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-weight:800;font-size:20px;margin-bottom:20px">Snag<span style="color:#e8590c">Deals</span></div>
<div style="background:#fff;border-radius:12px;padding:24px">${inner}</div>
<p style="color:#6b6b78;font-size:12px;margin-top:16px">SnagDeals · One wishlist. Every store. You choose the price.</p>
</div></body></html>`;

export function loginEmail(env: Env, email: string, code: string): EmailMessage {
  const link = `${env.APP_URL}/verify?email=${encodeURIComponent(email)}&code=${code}`;
  return {
    to: email,
    subject: `${code} is your SnagDeals sign-in code`,
    text: `Your SnagDeals sign-in code is ${code}\n\nOr open this link to finish signing in:\n${link}\n\nThe code expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: shell(`<p style="margin-top:0">Your sign-in code:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:8px 0 20px">${code}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Sign in to SnagDeals</a></p>
<p style="color:#6b6b78;font-size:14px">The code expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p>`),
  };
}

export interface AlertLine {
  title: string;
  price: number;
  store: string;
  target: string;
  label: string | null;
  buyUrl: string;
  itemUrl: string;
}

export function alertEmail(to: string, lines: AlertLine[], unsubscribeUrl: string): EmailMessage {
  const m = (n: number) => `$${n.toFixed(2)}`;
  const subject = lines.length === 1
    ? `${lines[0].title} hit your price: ${m(lines[0].price)}`
    : `${lines.length} games on your wishlist hit your price`;
  const text = lines
    .map((l) => `${l.title}\nNow ${m(l.price)} at ${l.store} · Your target: ${l.target}${l.label ? ` · ${l.label}` : ''}\nBuy: ${l.buyUrl}\nManage: ${l.itemUrl}`)
    .join('\n\n') + `\n\nStop price alerts: ${unsubscribeUrl}`;
  const rows = lines
    .map((l) => `<div style="border-top:1px solid #eee;padding:14px 0">
<div style="font-weight:700;font-size:16px">${esc(l.title)}</div>
<div style="margin:4px 0 10px;color:#3a3a46">Now <b>${m(l.price)}</b> at ${esc(l.store)} · Your target: ${esc(l.target)}${l.label ? ` · <span style="color:#2b8a3e">${esc(l.label)}</span>` : ''}</div>
<a href="${esc(l.buyUrl)}" style="background:#e8590c;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600;font-size:14px">Open store</a>
<a href="${esc(l.itemUrl)}" style="margin-left:12px;color:#3a3a46;font-size:14px">Change target</a></div>`)
    .join('');
  return {
    to,
    subject,
    text,
    html: shell(`<p style="margin-top:0;font-size:18px;font-weight:700">Your price was hit.</p>${rows}
<p style="color:#6b6b78;font-size:12px;margin-bottom:0"><a href="${esc(unsubscribeUrl)}" style="color:#6b6b78">Stop price alerts</a></p>`),
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
