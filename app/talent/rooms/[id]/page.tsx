import { notFound, redirect } from 'next/navigation';
import { TalentRoomDetailView } from '@/components/TalentRoomDetailView';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews, type TalentRoomDetail } from '@/lib/roomViews';

export const dynamic = 'force-dynamic';

export default async function TalentRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/talent/profile');
  const { id } = await params;
  let room: TalentRoomDetail;
  try {
    room = await roomViews().getRoomView(session.sub, id);
  } catch (e) {
    if (e instanceof TalentError && e.code === 'not_found') notFound();
    if (e instanceof TalentError) {
      return (
        <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
          <a href="/talent/rooms" className="text-sm text-[var(--muted)] hover:underline">← Back to rooms</a>
          <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{e.message}</p>
        </main>
      );
    }
    throw e;
  }

  return (
    <TalentRoomDetailView
      room={room}
      backHref={room.viewerSide === 'company' ? '/talent/rooms' : '/talent/requests'}
      backLabel={room.viewerSide === 'company' ? 'Company rooms' : 'Company requests'}
    />
  );
}
