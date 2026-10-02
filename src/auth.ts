import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env, User } from './types';

export const SESSION_COOKIE = 'sd_session';
const SESSION_TTL = 30 * 24 * 3600 * 1000;
export const CODE_TTL = 15 * 60 * 1000;
export const CODE_RESEND_COOLDOWN = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function hmac(secret: string, s: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomCode(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 1_000_000).padStart(6, '0');
}

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function secret(env: Env): string {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return env.AUTH_SECRET;
}

export const codeHash = (env: Env, email: string, code: string) => hmac(secret(env), `code:${email}:${code}`);

/** Fixed-window counter in D1. Returns false once `limit` hits are used in the window. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN ?2 ELSE rate_limits.window_start END
     RETURNING count`,
  ).bind(key, now, windowMs).first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_TTL).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL / 1000,
  });
}

export async function loadUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), Date.now()).first<User>();
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: unknown): string {
  const n = String(next ?? '');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/app';
}

export const unsubscribeToken = (env: Env, userId: string) => hmac(secret(env), `unsub:${userId}`);

export async function unsubscribeUrl(env: Env, userId: string): Promise<string> {
  return `${env.APP_URL}/unsubscribe?u=${encodeURIComponent(userId)}&t=${await unsubscribeToken(env, userId)}`;
}
