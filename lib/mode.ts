// Server code only: the mode cookie (see modes.ts for the values).
import { cookies } from 'next/headers';
import { parseMode, type Mode } from './modes.ts';

export { homeOf, parseMode, type Mode } from './modes.ts';
export const MODE_COOKIE = 'talent_mode';

export async function currentMode(): Promise<Mode> {
  return parseMode((await cookies()).get(MODE_COOKIE)?.value);
}

export async function setMode(mode: Mode): Promise<void> {
  (await cookies()).set(MODE_COOKIE, mode, {
    httpOnly: true, secure: (process.env.APP_URL ?? '').startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
}
