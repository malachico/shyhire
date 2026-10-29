import { roles } from '@/lib/talent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Vercel Cron, daily: each open role's agent contacts a few more good fits. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(await roles().fillAll());
}
