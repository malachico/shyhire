import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { TalentError } from '@/lib/profiles';
import { talentLinkedIn } from '@/lib/talent';

export async function GET() {
  const session = await currentSession();
  const base = appUrl();
  if (!session) return NextResponse.redirect(new URL('/talent/profile', base));
  const linkedin = talentLinkedIn();
  if (!linkedin) {
    const destination = new URL('/talent/profile', base);
    destination.searchParams.set('error', 'LinkedIn connection is not available yet.');
    return NextResponse.redirect(destination);
  }
  const state = randomBytes(24).toString('hex');
  try {
    const result = await linkedin.connect(session.sub, state);
    (await cookies()).set('talent_linkedin', JSON.stringify({ state, personId: session.sub }), {
      httpOnly: true, sameSite: 'lax', secure: base.startsWith('https:'), path: '/talent/auth/linkedin', maxAge: 600,
    });
    return NextResponse.redirect(result.url);
  } catch (error) {
    if (!(error instanceof TalentError)) throw error;
    const destination = new URL('/talent/profile', base);
    destination.searchParams.set('error', 'LinkedIn connection is unavailable. You can create your profile without it.');
    return NextResponse.redirect(destination);
  }
}
