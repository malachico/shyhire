import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Profile() {
  const session = await currentSession();
  if (!session) redirect('/');
  return <main className="mx-auto max-w-lg px-6 py-20">
    <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
    <p className="my-4 text-[var(--muted)]">Signed in with GitHub as <span className="font-mono text-[var(--fg)]">{session.login}</span>. Your profile comes next.</p>
    <form action="/talent/auth/signout" method="post"><button className="btn">Sign out</button></form>
  </main>;
}
