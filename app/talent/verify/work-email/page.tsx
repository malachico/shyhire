import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { currentMode } from '@/lib/mode';
import { WorkEmailForm } from '@/components/WorkEmailForm';

export const dynamic = 'force-dynamic';

export default async function VerifyWorkEmail() {
  if (!(await currentSession())) redirect('/');
  const hiring = (await currentMode()) === 'hire';
  return <WorkEmailForm next={hiring ? { href: '/talent/search', label: 'Find candidates' } : { href: '/talent/profile', label: 'Back to profile' }} hiring={hiring} />;
}
