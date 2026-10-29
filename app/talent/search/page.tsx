import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews } from '@/lib/roomViews';
import { statusOf } from '@/lib/status';
import { profiles, type CandidateSearch } from '@/lib/talent';
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
  // The candidates this person already talks to: their card shows that conversation instead of "Talk".
  // Oldest first, so the newest room for a candidate is the one that stays.
  const existing = Object.fromEntries((await roomViews().listCompanyRooms(session.sub).catch(() => [])).reverse().map((r) => [r.candidateAlias, { id: r.id, label: statusOf(r.status, { needsMe: !!r.needsDecision, summaryReady: r.documentVersion !== undefined, iApproved: r.iApproved }).label }]));
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <form action="/talent/search" className="flex gap-2">
      <input className="input min-w-0 flex-1" name="q" maxLength={1000} required defaultValue={q} aria-label="Describe the role" placeholder="Describe the role, e.g. backend engineer, Go, Postgres" />
      <button className="btn-primary" type="submit">Find</button>
    </form>
    {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}
    {!q ? <p className="muted mt-10 text-center text-sm">Describe the role and the skills you need.</p>
      : results && <CandidateResults results={results} query={q} existing={existing} />}
  </main>;
}
