import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { LINKEDIN_FLOW_COOKIE, linkedinClient, linkedinConfigured } from '@/lib/linkedin';

export async function GET() {
  const session = await currentSession();
  const base = appUrl();
  if (!session) return NextResponse.redirect(new URL('/talent/profile', base));
  if (!linkedinConfigured()) {
    const destination = new URL('/talent/profile', base);
    destination.searchParams.set('error', 'LinkedIn connection is not configured.');
    return NextResponse.redirect(destination);
  }
  const state = randomBytes(24).toString('base64url');
  (await cookies()).set(LINKEDIN_FLOW_COOKIE, JSON.stringify({ state, personId: session.sub }), {
    httpOnly: true,
    secure: base.startsWith('https:'),
    sameSite: 'lax',
    path: '/talent/auth/linkedin',
    maxAge: 600,
  });
  return NextResponse.redirect(linkedinClient().authorizeUrl(state));
}
