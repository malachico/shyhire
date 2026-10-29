import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/github';
import { GOOGLE_FLOW_COOKIE, googleClient, googleConfigured } from '@/lib/google';
import { parseMode } from '@/lib/mode';

export async function GET(request: Request) {
  const mode = parseMode(new URL(request.url).searchParams.get('as'));
  if (!googleConfigured()) return new NextResponse('Google sign-in is not configured', { status: 503 });
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  (await cookies()).set(GOOGLE_FLOW_COOKIE, JSON.stringify({ state, verifier, mode }), {
    httpOnly: true,
    secure: appUrl().startsWith('https:'),
    sameSite: 'lax',
    path: '/talent/auth/google',
    maxAge: 600,
  });
  return NextResponse.redirect(googleClient().authorizeUrl(state, verifier));
}
