// Server code only (route handlers and server components).
import { cookies } from 'next/headers';
import { SESSION_MAX_AGE_S, signSession, verifySession, type Session } from './session';

export const SESSION_COOKIE = 'talent_session';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (at least 32 characters)');
  return s;
}

const secure = () => (process.env.APP_URL ?? '').startsWith('https:');

export async function currentSession(): Promise<Session | undefined> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret());
}

/** Host-only (no Domain), so no other site shares it. */
export async function startSession(session: Omit<Session, 'issuedAt'>): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signSession({ ...session, issuedAt: Date.now() }, secret()), {
    httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE_S,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: 0 });
}
