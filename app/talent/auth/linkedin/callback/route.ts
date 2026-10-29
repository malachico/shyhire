import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';
import { talentLinkedIn } from '@/lib/talent';

export async function GET(request: Request) {
  const base = appUrl();
  const destination = new URL('/talent/profile', base), jar = await cookies();
  const raw = jar.get('talent_linkedin')?.value;
  jar.set('talent_linkedin', '', { httpOnly: true, sameSite: 'lax', secure: base.startsWith('https:'), path: '/talent/auth/linkedin', maxAge: 0 });
  try {
    const session = await currentSession();
    const linkedin = talentLinkedIn();
    const flow = JSON.parse(raw ?? 'null') as { state: string; personId: string } | null;
    const state = new URL(request.url).searchParams.get('state') ?? '';
    if (!session || !linkedin || !flow || typeof flow.state !== 'string' || flow.state.length !== state.length || !timingSafeEqual(Buffer.from(flow.state), Buffer.from(state)) || flow.personId !== session.sub) {
      throw new Error('Invalid state');
    }
    await linkedin.verify(session.sub);
  } catch {
    destination.searchParams.set('error', 'LinkedIn could not confirm this connection. Try reconnecting, or create your profile without it.');
  }
  return NextResponse.redirect(destination);
}
