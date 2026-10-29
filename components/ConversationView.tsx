'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { approveTalentRoom, passTalentRoom } from '@/lib/actions/rooms';
import type { TalentRoomDetail } from '@/lib/roomViews';
import { pillClass, statusOf } from '@/lib/status';
import { TalentRoomDecisionForm } from './TalentRoomDecisionForm';

/** One conversation: its status, the one thing it needs from you (if any), the contact once matched. */
export function ConversationView({ room }: { room: TalentRoomDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const doc = room.document;
  const ended = room.status === 'closed' || room.status === 'stuck';
  const matched = room.status === 'agreed';
  const myDecision = room.needsDecision && room.waitingOn === room.viewerSide ? room.needsDecision : undefined;
  const s = statusOf(room.status, { needsMe: !!myDecision, summaryReady: !!doc, iApproved: doc?.myApproved });
  const isCompany = room.viewerSide === 'company';
  const title = isCompany ? room.candidateAlias : room.companyName;
  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };
  const pass = () => {
    if (confirmPass()) run(() => passTalentRoom(room.id));
  };

  return <main className="mx-auto max-w-3xl px-4 py-8">
    <a href="/talent/conversations" className="muted text-sm">← Conversations</a>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="muted text-sm">{isCompany ? `You're hiring${room.brief?.role ? ` · ${room.brief.role}` : ''}` : 'Wants to talk with you'}</p>
      </div>
      <span className={pillClass(s.tone)}>{s.label}</span>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{error}</p>}

    {matched && room.revealedContact && <section aria-label="Contact details" className="card mt-6 border-[#abefc6]">
      <p className="font-semibold">You matched. Here&apos;s how to reach them.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="muted text-xs">Name</dt><dd>{room.revealedContact.displayName}</dd></div>
        {room.revealedContact.email && <div><dt className="muted text-xs">Email</dt><dd><a className="link" href={`mailto:${room.revealedContact.email}`}>{room.revealedContact.email}</a></dd></div>}
        {room.revealedContact.githubLogin && <div><dt className="muted text-xs">GitHub</dt><dd><a className="link" target="_blank" rel="noreferrer" href={room.revealedContact.githubUrl ?? `https://github.com/${room.revealedContact.githubLogin}`}>@{room.revealedContact.githubLogin}</a></dd></div>}
      </dl>
    </section>}

    {!ended && !matched && myDecision && <section className="card mt-6">
      <p className="muted text-xs font-medium uppercase tracking-wide">Your agent asks</p>
      <TalentRoomDecisionForm roomId={room.id} question={myDecision.question} options={myDecision.options} />
      <button type="button" className="muted mt-4 text-sm underline" disabled={pending} onClick={pass}>Pass on this conversation</button>
    </section>}

    {!ended && !matched && !myDecision && doc && <section className="card mt-6">
      <p className="font-semibold">{doc.myApproved ? 'You approved. Waiting for them.' : 'The agents agree on this summary'}</p>
      <div className="mt-3 whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-4 text-sm leading-relaxed">{doc.text}</div>
      {doc.myApproved
        ? <p className="muted mt-3 text-sm">Contact details are shared once they approve too.</p>
        : <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => approveTalentRoom(room.id, doc.version))}>{pending ? 'Approving…' : 'Approve'}</button>
            <button type="button" className="muted text-sm underline" disabled={pending} onClick={pass}>Pass</button>
          </div>}
      <p className="muted mt-3 text-xs">Approving shares your contact details with them only if they approve too.</p>
    </section>}

    {!ended && !matched && !myDecision && !doc && <section className="card mt-6">
      <p className="font-medium">{room.needsDecision ? 'Waiting for them to answer their agent.' : 'The agents are talking.'}</p>
      <p className="muted mt-1 text-sm">You&apos;ll see a summary here to approve, or a question if your agent needs you.</p>
      <button type="button" className="muted mt-4 text-sm underline" disabled={pending} onClick={pass}>Pass on this conversation</button>
    </section>}

    {ended && <section className="card mt-6"><p className="font-medium">This conversation ended.</p><p className="muted mt-1 text-sm">No contact details were shared.</p></section>}

    {isCompany && room.brief && (room.brief.comp || room.brief.mustHaves) && <details className="mt-6">
      <summary className="cursor-pointer text-sm font-medium">Your private brief</summary>
      <dl className="mt-3 space-y-2 text-sm">
        {room.brief.comp && <div><dt className="muted text-xs">Salary band</dt><dd>{room.brief.comp}</dd></div>}
        {room.brief.mustHaves && <div><dt className="muted text-xs">Must-haves</dt><dd className="whitespace-pre-wrap">{room.brief.mustHaves}</dd></div>}
      </dl>
    </details>}

    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-medium">See what the agents said ({room.messages.length})</summary>
      {!room.messages.length ? <p className="muted mt-3 text-sm">Nothing yet.</p> : <ul className="mt-3 space-y-2">
        {room.messages.map((m) => <li key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <p className="muted text-xs">{m.from}{m.channel === 'corner' && ' · only you see this'}</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.text}</p>
        </li>)}
      </ul>}
    </details>
  </main>;
}

function confirmPass(): boolean {
  return typeof window === 'undefined' || window.confirm('End this conversation? No contact details will be shared.');
}
