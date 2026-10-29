import { notFound, redirect } from 'next/navigation';
import { ConversationView } from '@/components/ConversationView';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews, type TalentRoomDetail } from '@/lib/roomViews';

export const dynamic = 'force-dynamic';

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/');
  const { id } = await params;
  let room: TalentRoomDetail;
  try {
    room = await roomViews().getRoomView(session.sub, id);
  } catch (e) {
    if (e instanceof TalentError && e.code === 'not_found') notFound();
    if (!(e instanceof TalentError)) throw e;
    return <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/talent/conversations" className="muted text-sm">← Conversations</a>
      <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{e.message}</p>
    </main>;
  }
  return <ConversationView room={room} />;
}
