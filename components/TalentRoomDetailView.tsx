'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { approveTalentRoom } from '@/lib/actions/rooms';
import type { RoomStatus } from '@/lib/parly';
import type { RoomSideKind, TalentRoomDetail } from '@/lib/roomViews';
import { TalentRoomDecisionForm } from './TalentRoomDecisionForm';

export function statusBadgeLabel(status: RoomStatus, viewerSide: RoomSideKind, waitingOn?: RoomSideKind): { label: string; highlight?: boolean } {
  if (status === 'agreed') return { label: 'Agreed (Match)', highlight: true };
  if (status === 'needs_decision') {
    if (waitingOn === viewerSide) return { label: 'Needs your decision', highlight: true };
    if (waitingOn) return { label: viewerSide === 'company' ? 'Waiting on candidate' : 'Waiting on company' };
    return { label: 'Needs decision' };
  }
  if (status === 'stuck') return { label: 'Not a fit' };
  if (status === 'closed') return { label: 'Closed' };
  return { label: 'Agents talking' };
}

export function TalentRoomDetailView({ room, backHref, backLabel }: { room: TalentRoomDetail; backHref: string; backLabel: string }) {
  const router = useRouter();
  const [approveError, setApproveError] = useState<string>();
  const [approvedNow, setApprovedNow] = useState(false);
  const [agreedNow, setAgreedNow] = useState(false);
  const [pendingApprove, startApprove] = useTransition();

  const statusInfo = statusBadgeLabel(agreedNow ? 'agreed' : room.status, room.viewerSide, room.waitingOn);
  const doc = room.document;
  const myApproved = Boolean(doc?.myApproved || approvedNow);
  const canApprove = Boolean(doc && !myApproved && !['closed', 'stuck', 'agreed'].includes(room.status) && !agreedNow);

  function handleApprove() {
    if (!doc) return;
    setApproveError(undefined);
    startApprove(async () => {
      const res = await approveTalentRoom(room.id, doc.version);
      if ('error' in res) return setApproveError(res.error);
      setApprovedNow(true);
      if (res.agreed) setAgreedNow(true);
      router.refresh();
    });
  }

  const badgeCls = statusInfo.highlight ? 'bg-[var(--accent-bg)] text-[var(--accent)]' : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]';
  const b = room.viewerSide === 'company' ? room.brief : undefined;
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href={backHref} className="text-sm text-[var(--muted)] hover:underline">← {backLabel}</a>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeCls}`}>{statusInfo.label}</span>
      </div>
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{room.viewerSide === 'company' ? room.candidateAlias : room.companyName}</h1>
          <span className="text-xs text-[var(--muted)]">{room.viewerSide === 'company' ? `Company: ${room.companyName}` : `Your alias: ${room.candidateAlias}`}</span>
        </div>
        {room.goal && <p className="mt-2 text-sm text-[var(--muted)]">{room.goal}</p>}
        {b && (b.role || b.comp || b.mustHaves) && (
          <dl className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-3">
            {b.role && <div><dt className="text-xs text-[var(--muted)]">Role</dt><dd className="mt-0.5 font-medium">{b.role}</dd></div>}
            {b.comp && <div><dt className="text-xs text-[var(--muted)]">Compensation</dt><dd className="mt-0.5 font-medium">{b.comp}</dd></div>}
            {b.mustHaves && <div><dt className="text-xs text-[var(--muted)]">Must-haves</dt><dd className="mt-0.5">{b.mustHaves}</dd></div>}
          </dl>
        )}
        {room.needsDecision && <TalentRoomDecisionForm roomId={room.id} question={room.needsDecision.question} options={room.needsDecision.options} />}
      </header>
      <section aria-label="Shared fit summary" className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Shared fit summary</h2>
            {doc && <p className="mt-0.5 text-xs text-[var(--muted)]">Version {doc.version} · {myApproved ? 'Approved by you' : 'Not yet approved by you'} · {doc.otherApproved || agreedNow ? 'Approved by other side' : 'Awaiting other side'}</p>}
          </div>
          {canApprove && <button type="button" onClick={handleApprove} disabled={pendingApprove} className="btn-primary text-sm">{pendingApprove ? 'Approving…' : `Approve v${doc!.version}`}</button>}
        </div>
        {approveError && <p role="alert" className="mt-3 text-xs text-[var(--bad-fg)]">{approveError}</p>}
        {doc ? <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-sm leading-relaxed">{doc.text}</div> : <p className="mt-3 text-sm text-[var(--muted)]">The agents are still checking fit and have not drafted the shared summary yet.</p>}
      </section>
      <section aria-label="Room messages" className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">Room conversation</h2>
        {!room.messages.length ? <p className="mt-3 text-sm text-[var(--muted)]">No messages yet.</p> : (
          <ul className="mt-4 space-y-3">
            {room.messages.map((msg) => (
              <li key={msg.id} className={`rounded-lg border p-3.5 text-sm ${msg.channel === 'corner' ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border)] bg-[var(--bg)]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--fg)]">{msg.from}{msg.channel === 'corner' && <span className="ml-2 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">Private corner</span>}</span>
                  {msg.at && <time dateTime={msg.at}>{msg.at.slice(0, 16).replace('T', ' ')}</time>}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

