import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { appUrl, CALLBACK_PATH, GITHUB_FLOW_COOKIE, githubConfigured } from '@/lib/github';

export async function GET() {
  const session = await currentSession();
  const base = appUrl();
  if (!session) return NextResponse.redirect(new URL('/talent/profile', base));
  if (!githubConfigured()) {
    const destination = new URL('/talent/profile', base);
    destination.searchParams.set('error', 'GitHub connection is not configured.');
    return NextResponse.redirect(destination);
  }
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  (await cookies()).set(GITHUB_FLOW_COOKIE, JSON.stringify({ state, verifier, personId: session.sub }), {
    httpOnly: true,
    secure: base.startsWith('https:'),
    sameSite: 'lax',
    path: '/talent/auth/github',
    maxAge: 600,
  });
  const query = new URLSearchParams({
    client_id: process.env.TALENT_GITHUB_CLIENT_ID!,
    redirect_uri: `${base}${CALLBACK_PATH}`,
    scope: 'read:user',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${query}`);
}

