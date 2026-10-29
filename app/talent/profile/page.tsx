import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { githubConfigured } from '@/lib/github';
import { linkedinConfigured } from '@/lib/linkedin';
import { profileImportConfigured, profiles, workEmailConfigured } from '@/lib/talent';
import { TalentProfileEditor } from '@/components/TalentProfileEditor';

export const dynamic = 'force-dynamic';

export default async function Profile({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/');
  const { error } = await searchParams;
  return <TalentProfileEditor
    initial={await profiles().mine(session.sub)}
    me={{ name: session.name ?? '', email: session.email ?? '' }}
    error={error}
    githubAvailable={githubConfigured()}
    linkedinAvailable={linkedinConfigured()}
    workEmailAvailable={workEmailConfigured()}
    importAvailable={profileImportConfigured()}
  />;
}
