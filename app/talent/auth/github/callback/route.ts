import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { startSession } from '@/lib/auth';
import { appUrl, GITHUB_FLOW_COOKIE, githubAccount, githubConfigured } from '@/lib/github';
import { TalentError } from '@/lib/profiles';
import { profiles } from '@/lib/talent';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  if (!githubConfigured()) return new NextResponse('GitHub sign-in is not configured', { status: 503 });
  const jar = await cookies();
  const raw = jar.get(GITHUB_FLOW_COOKIE)?.value;
  jar.set(GITHUB_FLOW_COOKIE, '', { httpOnly: true, secure: appUrl().startsWith('https:'), sameSite: 'lax', path: '/talent/auth/github', maxAge: 0 });
  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '', state = params.get('state') ?? '';
  try {
    const flow = JSON.parse(raw ?? 'null') as { state?: string; verifier?: string } | null;
    if (!flow?.state || !flow.verifier || !code || !same(flow.state, state)) throw new Error('Invalid sign-in state');
    const account = await githubAccount(code, flow.verifier);
    await startSession({ githubId: account.id, login: account.login });
    await profiles().verify(String(account.id), account.verification);
    return NextResponse.redirect(`${appUrl()}/talent/profile`);
  } catch (error) {
    const msg = error instanceof TalentError ? error.message : 'GitHub sign-in failed. Please try again.';
    return NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(msg)}`);
  }
}

