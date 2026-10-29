import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { profiles, workEmailConfigured, type CandidateSearch } from '@/lib/talent';
import { CandidateResults } from '@/components/CandidateResults';

export const dynamic = 'force-dynamic';

export default async function TalentSearch({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await currentSession();
  if (!session) redirect('/talent/profile');
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] ?? '' : params.q ?? '';
  let results: CandidateSearch | undefined, error: string | undefined;
  try {
    results = await profiles().search(String(session.githubId), q);
  } catch (e) {
    if (!(e instanceof TalentError)) throw e;
    error = e.message;
  }
  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
    <h1 className="text-3xl font-semibold tracking-tight">Find your next teammate.</h1>
    <p className="mt-3 max-w-2xl text-[var(--muted)]">Describe the role and technologies. Browse anonymous professional profiles, then open a room to check fit together.</p>
    <form action="/talent/search" className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
      <label className="w-full flex-1 text-sm font-medium">Describe the role<textarea className="input mt-2 min-h-24 w-full" name="q" maxLength={1000} required defaultValue={q} placeholder="Backend engineer with Python, SQL and Docker" /></label>
      <button className="btn-primary min-h-11" type="submit">Search candidates</button>
    </form>
    {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}{workEmailConfigured() && <> <a href="/talent/verify/work-email" className="underline">Verify work email</a></>}</p>}
    {results && <CandidateResults results={results} query={q} />}
  </main>;
}
