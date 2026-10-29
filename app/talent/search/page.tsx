import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews } from '@/lib/roomViews';
import { statusOf } from '@/lib/status';
import { profiles, roles, type CandidateSearch } from '@/lib/talent';
import { RoleActions, RoleForm } from '@/components/Roles';
import { CandidateResults } from '@/components/CandidateResults';

export const dynamic = 'force-dynamic';

export default async function Find({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await currentSession();
  if (!session) redirect('/');
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? '';
  let results: CandidateSearch | undefined, error: string | undefined, unverified = false;
  try {
    results = await profiles().search(session.sub, q);
  } catch (e) {
    if (!(e instanceof TalentError)) throw e;
    if (e.code === 'forbidden') unverified = true;
    else error = e.message;
  }
  if (unverified) return <main className="mx-auto max-w-xl px-4 py-12">
    <h1 className="text-2xl font-semibold tracking-tight">Verify your work email</h1>
    <p className="muted mt-2">Candidates only talk to verified companies. It takes a minute.</p>
    <a href="/talent/verify/work-email" className="btn-primary mt-6">Verify work email</a>
  </main>;
  if (!q) {
    const list = await roles().list(session.sub);
    return <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <h1 className="text-[28px] leading-none">Hiring</h1>
      {error && <p role="alert" className="text-sm text-[var(--bad-fg)]">{error}</p>}
      <RoleForm first={!list.length} />
      {list.map((r) => <section key={r.id} aria-label={r.title} className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="font-semibold">{r.title}</h2><p className="muted line-clamp-2 text-sm">{r.looking}</p></div>
          <span className={`pill shrink-0 ${r.status === 'open' ? 'pill-good' : ''}`}>{r.status === 'open' ? 'Finding fits' : 'Paused'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-sm">
          <span className="pill">{r.stats.talking} talking</span>
          {r.stats.needsYou > 0 && <a href="/talent/conversations" className="pill pill-accent">{r.stats.needsYou} need{r.stats.needsYou === 1 ? 's' : ''} you</a>}
          <span className="pill">{r.stats.matched} matched</span>
          <span className="pill">{r.contacted.length} contacted</span>
        </div>
        <div className="flex items-center justify-between gap-3"><a href="/talent/conversations" className="text-sm font-medium underline underline-offset-4">Conversations</a><RoleActions id={r.id} status={r.status} /></div>
      </section>)}
      <form action="/talent/search" className="flex gap-2 pt-4">
        <input className="input min-w-0 flex-1 text-sm" name="q" maxLength={1000} required aria-label="Browse candidates" placeholder="Or browse candidates yourself…" />
        <button className="btn text-sm" type="submit">Browse</button>
      </form>
    </main>;
  }
  // The candidates this person already talks to: their card shows that conversation instead of "Talk".
  // Oldest first, so the newest room for a candidate is the one that stays.
  const existing = Object.fromEntries((await roomViews().listCompanyRooms(session.sub).catch(() => [])).reverse().map((r) => [r.candidateAlias, { id: r.id, label: statusOf(r.status, { needsMe: !!r.needsDecision, summaryReady: r.documentVersion !== undefined, iApproved: r.iApproved }).label }]));
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <form action="/talent/search" className="flex gap-2">
      <input className="input min-w-0 flex-1" name="q" maxLength={1000} required defaultValue={q} aria-label="Describe the role" placeholder="Describe the role, e.g. backend engineer, Go, Postgres" />
      <button className="btn-primary" type="submit">Find</button>
    </form>
    {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}
    <a href="/talent/search" className="muted mb-4 inline-block text-sm">← Roles</a>
    {results && <CandidateResults results={results} query={q} existing={existing} />}
  </main>;
}
