import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { currentMode, homeOf } from '@/lib/mode';

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentSession()) redirect(homeOf(await currentMode()));
  const { error } = await searchParams;
  const choice = 'card block transition-colors hover:border-[var(--accent)]';
  return <main className="mx-auto max-w-xl px-4 py-16 sm:py-24">
    <p className="text-sm font-semibold tracking-tight">Hireroom</p>
    <h1 className="mt-8 text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">Let your work introduce you.</h1>
    <p className="muted mt-3">Agents check the fit first. Names stay private until both sides say yes.</p>
    {error && <p role="alert" className="mt-6 rounded-lg bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{error}</p>}
    <div className="mt-8 grid gap-3">
      <a className={choice} href="/talent/auth/google/start?as=work">
        <span className="block font-semibold">I&apos;m looking for work →</span>
        <span className="muted mt-1 block text-sm">Your agent checks the fit. Your name stays private until you say yes.</span>
      </a>
      <a className={choice} href="/talent/auth/google/start?as=hire">
        <span className="block font-semibold">I&apos;m hiring →</span>
        <span className="muted mt-1 block text-sm">Talk to pre-checked candidates. Verify your work email, describe the role.</span>
      </a>
    </div>
    <p className="muted mt-6 text-xs">Both continue with Google.</p>
  </main>;
}
