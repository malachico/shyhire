import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { currentMode } from '@/lib/mode';
import { TalentError } from '@/lib/profiles';
import { roomViews, type ConversationRow } from '@/lib/roomViews';
import { profiles } from '@/lib/talent';
import { statusOf } from '@/lib/status';
import { ConversationList } from '@/components/ConversationList';

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
  const profile = mode === 'hire' ? undefined : await profiles().mine(session.sub);
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
    {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}
    {!error && !rows.length && <div className="card mt-6 text-center">
      <p className="muted text-sm">No conversations yet.</p>
      {mode === 'hire'
        ? <a href="/talent/search" className="btn-primary mt-4">Find candidates</a>
        : !profile?.version
          ? <a href="/talent/profile" className="btn-primary mt-4">Complete your profile</a>
          : <p className="mt-2 text-sm">{profile.paused ? <>Your profile is paused. <a href="/talent/profile" className="link">Resume it</a> to get conversations.</> : "You're all set. When a company's agent wants to talk with you, it shows up here."}</p>}
    </div>}
    {!!rows.length && <ConversationList rows={rows.map((r) => ({
      id: r.id,
      title: r.title || 'Conversation',
      sub: `${r.side === 'company' ? "You're hiring" : 'Wants to talk with you'}${r.role ? ` · ${r.role}` : ''}`,
      updatedAt: r.updatedAt,
      ...statusOf(r.status, { needsMe: r.needsMe, summaryReady: r.documentVersion !== undefined, iApproved: r.iApproved }),
    }))} />}
  </main>;
}
