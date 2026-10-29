import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { currentMode } from '@/lib/mode';
import { TalentError } from '@/lib/profiles';
import { roomViews, type ConversationRow } from '@/lib/roomViews';
import { pillClass, statusOf } from '@/lib/status';

export const dynamic = 'force-dynamic';

export default async function Conversations() {
  const session = await currentSession();
  if (!session) redirect('/');
  const mode = await currentMode();
  let rows: ConversationRow[] = [], error: string | undefined;
  try {
    rows = await roomViews().listConversations(session.sub);
  } catch (e) {
    if (!(e instanceof TalentError)) throw e;
    error = e.message;
  }
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
    {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}
    {!error && !rows.length && <div className="card mt-6 text-center">
      <p className="muted text-sm">No conversations yet.</p>
      {mode === 'hire'
        ? <a href="/talent/search" className="btn-primary mt-4">Find candidates</a>
        : <a href="/talent/profile" className="btn-primary mt-4">Complete your profile</a>}
    </div>}
    {!!rows.length && <ul className="mt-6 divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)]">
      {rows.map((r) => {
        const s = statusOf(r.status, { needsMe: r.needsMe, summaryReady: r.documentVersion !== undefined, iApproved: r.iApproved });
        return <li key={r.id}><a href={`/talent/conversations/${encodeURIComponent(r.id)}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--bg)]">
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.title || 'Conversation'}</span>
            <span className="muted block truncate text-sm">{r.side === 'company' ? `You're hiring${r.role ? ` · ${r.role}` : ''}` : 'Wants to talk with you'}</span>
          </span>
          <span className={pillClass(s.tone)}>{s.label}</span>
        </a></li>;
      })}
    </ul>}
  </main>;
}
