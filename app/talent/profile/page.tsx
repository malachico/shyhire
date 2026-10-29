import { currentSession } from '@/lib/auth';
import { profiles, talentLinkedIn } from '@/lib/talent';
import { TalentProfileEditor } from '@/components/TalentProfileEditor';

export const dynamic = 'force-dynamic';

export default async function CandidateProfile({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await currentSession();
  if (!session) {
    return <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Your next chapter starts with your work.</h1>
      <p className="my-6 text-[var(--muted)]">Connect GitHub to build your candidate profile. Only public activity and your restricted contribution count are imported.</p>
      {error && <p role="alert" className="mb-4 text-[var(--bad-fg)]">{error}</p>}
      <a className="btn-primary" href="/talent/auth/github/start">Continue with GitHub</a>
    </main>;
  }
  const profile = await profiles().mine(String(session.githubId));
  return <TalentProfileEditor initial={profile} error={error} linkedinAvailable={Boolean(talentLinkedIn())} />;
}

