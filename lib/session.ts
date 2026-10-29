import { createHmac, timingSafeEqual } from 'node:crypto';

/** Who is signed in: the Google account (`sub` is the person's id in Talent). */
export interface Session {
  sub: string;
  email?: string;
  name?: string;
  issuedAt: number;
}

const MAX_AGE_S = 60 * 60 * 24 * 30;

const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/** `<base64url json>.<hmac>`: tamper-evident, not encrypted (it holds nothing secret). */
export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${mac(payload, secret)}`;
}

/** The session in a cookie value, or undefined if it's forged, malformed or older than 30 days. */
export function verifySession(value: string | undefined, secret: string, now = Date.now()): Session | undefined {
  if (!value) return undefined;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return undefined;
  const want = Buffer.from(mac(payload, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Session>;
    if (typeof s.sub !== 'string' || !s.sub.trim() || typeof s.issuedAt !== 'number') return undefined;
    if (s.email !== undefined && typeof s.email !== 'string') return undefined;
    if (s.name !== undefined && typeof s.name !== 'string') return undefined;
    if (now - s.issuedAt > MAX_AGE_S * 1000) return undefined;
    return {
      sub: s.sub.trim(),
      ...(s.email ? { email: s.email } : {}),
      ...(s.name ? { name: s.name } : {}),
      issuedAt: s.issuedAt,
    };
  } catch {
    return undefined;
  }
}

export const SESSION_MAX_AGE_S = MAX_AGE_S;

