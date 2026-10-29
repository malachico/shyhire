import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { LINKEDIN_FLOW_COOKIE, linkedinAccount, linkedinConfigured } from '@/lib/linkedin';
import { TalentError } from '@/lib/profiles';
import { profiles } from '@/lib/talent';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  const base = appUrl();
  const jar = await cookies();
  const raw = jar.get(LINKEDIN_FLOW_COOKIE)?.value;
  jar.set(LINKEDIN_FLOW_COOKIE, '', {
    httpOnly: true,
    secure: base.startsWith('https:'),
    sameSite: 'lax',
    path: '/talent/auth/linkedin',
    maxAge: 0,
  });
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL('/talent/profile', base));
  if (!linkedinConfigured()) {
    return NextResponse.redirect(`${base}/talent/profile?error=${encodeURIComponent('LinkedIn connection is not configured.')}`);
  }
  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  try {
    const flow = JSON.parse(raw ?? 'null') as { state?: string; personId?: string } | null;
    if (!flow?.state || !code || !same(flow.state, state) || flow.personId !== session.sub) {
      throw new Error('Invalid LinkedIn connection state');
    }
    const account = await linkedinAccount(code);
    await profiles().verify(session.sub, account.verification);
    return NextResponse.redirect(`${base}/talent/profile`);
  } catch (error) {
    const msg = error instanceof TalentError ? error.message : 'LinkedIn connection failed. Please try again.';
    return NextResponse.redirect(`${base}/talent/profile?error=${encodeURIComponent(msg)}`);
  }
}

