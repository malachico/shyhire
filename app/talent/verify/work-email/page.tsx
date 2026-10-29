import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { WorkEmailForm } from '@/components/WorkEmailForm';

export const dynamic = 'force-dynamic';

export default async function VerifyWorkEmail() {
  if (!(await currentSession())) redirect('/talent/profile');
  return <WorkEmailForm />;
}
