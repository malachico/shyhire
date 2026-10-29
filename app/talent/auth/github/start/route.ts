import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appUrl, CALLBACK_PATH, GITHUB_FLOW_COOKIE, githubConfigured } from '@/lib/github';

export async function GET() {
  if (!githubConfigured()) return new NextResponse('GitHub sign-in is not configured', { status: 503 });
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  (await cookies()).set(GITHUB_FLOW_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true, secure: appUrl().startsWith('https:'), sameSite: 'lax', path: '/talent/auth/github', maxAge: 600,
  });
  const query = new URLSearchParams({
    client_id: process.env.TALENT_GITHUB_CLIENT_ID!, redirect_uri: `${appUrl()}${CALLBACK_PATH}`, scope: 'read:user',
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  });
  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${query}`);
}
