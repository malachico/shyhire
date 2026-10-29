import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_S = 5 * 60;

/**
 * Checks Parly's `Parly-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` header.
 * Pass the raw body exactly as received; anything older than 5 minutes is refused (replays).
 */
export function verifyParlySignature(header: string | null, rawBody: string, secret: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts.t), v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || Math.abs(nowS - t) > TOLERANCE_S) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  const got = Buffer.from(v1);
  return want.length === got.length && timingSafeEqual(want, got);
}
