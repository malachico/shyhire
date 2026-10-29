import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentSession()) redirect('/talent/profile');
  const { error } = await searchParams;
  return <main className="mx-auto max-w-lg px-6 py-20">
    <p className="text-sm font-semibold tracking-tight">Parly <span className="font-normal text-[var(--muted)]">Talent</span></p>
    <h1 className="mt-6 text-3xl font-semibold tracking-tight [text-wrap:balance]">Let your work introduce you.</h1>
    <p className="my-6 text-[var(--muted)]">Agents check the fit first. Your name stays private until both sides say yes.</p>
    {error && <p role="alert" className="mb-4 text-[var(--bad-fg)]">{error}</p>}
    <a className="btn-primary" href="/talent/auth/google/start">Continue with Google</a>
  </main>;
}

