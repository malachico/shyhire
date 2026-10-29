import { currentSession } from '@/lib/auth';
import { githubConfigured } from '@/lib/github';
import { profileImportConfigured, profiles, talentLinkedIn, workEmailConfigured } from '@/lib/talent';
import { TalentProfileEditor } from '@/components/TalentProfileEditor';

export const dynamic = 'force-dynamic';

export default async function CandidateProfile({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await currentSession();
  if (!session) {
    return <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Your next chapter starts with your work.</h1>
      <p className="my-6 text-[var(--muted)]">Sign in with Google to build your candidate profile. Afterwards you can optionally connect GitHub, upload a CV, or connect LinkedIn.</p>
      {error && <p role="alert" className="mb-4 text-[var(--bad-fg)]">{error}</p>}
      <a className="btn-primary" href="/talent/auth/google/start">Continue with Google</a>
    </main>;
  }
  const profile = await profiles().mine(session.sub);
  return (
    <TalentProfileEditor
      initial={profile}
      error={error}
      githubAvailable={githubConfigured()}
      linkedinAvailable={Boolean(talentLinkedIn())}
      workEmailAvailable={workEmailConfigured()}
      importAvailable={profileImportConfigured()}
    />
  );
}


