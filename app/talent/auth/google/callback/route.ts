import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { startSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { GOOGLE_FLOW_COOKIE, googleAccount, googleConfigured } from '@/lib/google';
import { TalentError } from '@/lib/profiles';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  if (!googleConfigured()) return new NextResponse('Google sign-in is not configured', { status: 503 });
  const jar = await cookies();
  const raw = jar.get(GOOGLE_FLOW_COOKIE)?.value;
  jar.set(GOOGLE_FLOW_COOKIE, '', {
    httpOnly: true,
    secure: appUrl().startsWith('https:'),
    sameSite: 'lax',
    path: '/talent/auth/google',
    maxAge: 0,
  });
  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  try {
    const flow = JSON.parse(raw ?? 'null') as { state?: string; verifier?: string } | null;
    if (!flow?.state || !flow.verifier || !code || !same(flow.state, state)) {
      throw new Error('Invalid sign-in state');
    }
    const account = await googleAccount(code, flow.verifier);
    await startSession({
      sub: account.sub,
      email: account.email,
      ...(account.name ? { name: account.name } : {}),
    });
    return NextResponse.redirect(`${appUrl()}/talent/profile`);
  } catch (error) {
    const msg = error instanceof TalentError ? error.message : 'Google sign-in failed. Please try again.';
    return NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(msg)}`);
  }
}
