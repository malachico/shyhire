import { NextResponse } from 'next/server';
import { endSession } from '@/lib/auth';
import { appUrl } from '@/lib/github';

/** A form POST from this site only (SameSite=Lax keeps cross-site POSTs from carrying the cookie anyway). */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== appUrl()) return new NextResponse('Forbidden', { status: 403 });
  await endSession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
