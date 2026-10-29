import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { startSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { GOOGLE_FLOW_COOKIE, googleClient, googleConfigured } from '@/lib/google';
import { homeOf, parseMode, setMode } from '@/lib/mode';
import { TalentError } from '@/lib/profiles';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const back = (msg: string) => NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(msg)}`, 303);

/** Google posts the signed ID token here (form_post). */
export async function POST(request: Request) {
  if (!googleConfigured()) return new NextResponse('Google sign-in is not configured', { status: 503 });
  const jar = await cookies();
  const raw = jar.get(GOOGLE_FLOW_COOKIE)?.value;
  jar.set(GOOGLE_FLOW_COOKIE, '', { httpOnly: true, secure: appUrl().startsWith('https:'), sameSite: 'lax', path: '/talent/auth/google', maxAge: 0 });
  const form = await request.formData().catch(() => undefined);
  const idToken = form?.get('id_token');
  const state = String(form?.get('state') ?? '');
  try {
    const flow = JSON.parse(raw ?? 'null') as { state?: string; nonce?: string; mode?: string } | null;
    if (!flow?.state || !flow.nonce || !state || !same(flow.state, state)) throw new Error('Invalid sign-in state');
    const account = await googleClient().identity(idToken, flow.nonce);
    await startSession({ sub: account.sub, email: account.email, ...(account.name ? { name: account.name } : {}) });
    const mode = parseMode(flow.mode);
    await setMode(mode);
    return NextResponse.redirect(`${appUrl()}${homeOf(mode)}`, 303);
  } catch (error) {
    return back(error instanceof TalentError ? error.message : 'Google sign-in failed. Please try again.');
  }
}

/** A cancelled or failed sign-in can land here as a plain redirect. */
export async function GET() {
  return back('Google sign-in was cancelled. Please try again.');
}
