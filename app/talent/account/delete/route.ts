import { NextResponse } from 'next/server';
import { deleteSessionAccount } from '@/lib/account';
import { currentSession, endSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { appUrl } from '@/lib/github';
import { parly } from '@/lib/parly';

/** A form POST from this site only. The person comes from the signed session; the body is never read. */
export async function POST(request: Request) {
  const result = await deleteSessionAccount(request, await currentSession(), appUrl(), db(), parly);
  if (result === 'forbidden') return new NextResponse('Forbidden', { status: 403 });
  if (result === 'deleted') await endSession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
