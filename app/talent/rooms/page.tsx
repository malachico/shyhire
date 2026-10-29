import { redirect } from 'next/navigation';
import { TalentRoomDecisionForm } from '@/components/TalentRoomDecisionForm';
import { statusBadgeLabel } from '@/components/TalentRoomDetailView';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews, type CompanyRoomSummary } from '@/lib/roomViews';

export const dynamic = 'force-dynamic';

export default async function CompanyRoomsPage() {
  const session = await currentSession();
  if (!session) redirect('/talent/profile');
  let rooms: CompanyRoomSummary[] = [];
  let error: string | undefined;
  try {
    rooms = await roomViews().listCompanyRooms(session.sub);
  } catch (e) {
    if (!(e instanceof TalentError)) throw e;
    error = e.message;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Company rooms</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Track fit rooms your team opened with candidates, answer questions from your agent, and approve the shared fit summary.
          </p>
        </div>
        <a href="/talent/search" className="btn-primary text-sm">Find candidates</a>
      </div>

      {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}

      {!error && !rooms.length ? (
        <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">You have not opened any candidate rooms yet.</p>
          <a href="/talent/search" className="btn mt-4 text-sm">Search anonymous candidates</a>
        </div>
      ) : (
        <ul aria-label="Company rooms" className="mt-8 space-y-4">
          {rooms.map((room) => {
            const statusInfo = statusBadgeLabel(room.status, 'company', room.waitingOn);
            const badgeCls = statusInfo.highlight
              ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
              : 'border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]';
            return (
              <li key={room.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <a href={`/talent/rooms/${encodeURIComponent(room.id)}`} className="text-lg font-semibold hover:underline">
                        {room.candidateAlias}
                      </a>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>{statusInfo.label}</span>
                      {room.documentVersion !== undefined && (
                        <span className="text-xs text-[var(--muted)]">Summary v{room.documentVersion}</span>
                      )}
                    </div>
                    {room.brief.role && (
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        <span className="font-medium text-[var(--fg)]">{room.brief.role}</span>
                        {room.brief.comp ? ` · ${room.brief.comp}` : ''}
                      </p>
                    )}
                  </div>
                  <a href={`/talent/rooms/${encodeURIComponent(room.id)}`} className="btn text-sm">
                    Open room
                  </a>
                </div>
                {room.needsDecision && (
                  <TalentRoomDecisionForm
                    roomId={room.id}
                    question={room.needsDecision.question}
                    options={room.needsDecision.options}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
