import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { profiles } from '@/lib/talent';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  try {
    if (!origin || new URL(origin).host !== request.headers.get('host')) throw new Error('Invalid origin');
  } catch {
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  }
  const session = await currentSession();
  if (!session) return Response.json({ error: 'Sign in first' }, { status: 401 });
  if (!request.body) return Response.json({ error: 'Missing draft input' }, { status: 400 });
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4 * 1024 * 1024 + 100_000) {
      await reader.cancel();
      return Response.json({ error: 'Choose a PDF up to 3 MB' }, { status: 413 });
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return Response.json({ error: 'Invalid draft input' }, { status: 400 });
  }
  try {
    return Response.json({ draft: await profiles().draft(session.sub, body) });
  } catch (error) {
    if (error instanceof TalentError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
