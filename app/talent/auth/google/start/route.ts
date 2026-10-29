import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/github';
import { GOOGLE_FLOW_COOKIE, googleClient, googleConfigured } from '@/lib/google';
import { parseMode } from '@/lib/mode';

export async function GET(request: Request) {
  if (!googleConfigured()) return new NextResponse('Google sign-in is not configured', { status: 503 });
  const mode = parseMode(new URL(request.url).searchParams.get('as'));
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  // Google posts the ID token back from its own site, so this short-lived cookie must travel on a cross-site POST.
  const secure = appUrl().startsWith('https:');
  (await cookies()).set(GOOGLE_FLOW_COOKIE, JSON.stringify({ state, nonce, mode }), {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/talent/auth/google',
    maxAge: 600,
  });
  return NextResponse.redirect(googleClient().authorizeUrl(state, nonce));
}
