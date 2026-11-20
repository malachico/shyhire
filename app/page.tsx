import { redirect } from 'next/navigation';
import { AppIcon, Mark, Wordmark } from '@/components/Brand';
import { currentSession } from '@/lib/auth';
import { currentMode, homeOf } from '@/lib/mode';
import { signInErrorMessage } from '@/lib/signInError';

const Arrow = ({ color }: { color: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await currentSession()) redirect(homeOf(await currentMode()));
  const message = signInErrorMessage((await searchParams).error);
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-7 px-6 py-7">
    <div className="flex items-center gap-2"><AppIcon /><Wordmark /></div>
    <div className="flex justify-center pt-2"><Mark size={168} label="The Shyhire creature holding out a flower" /></div>
    <div className="space-y-2.5">
      <h1 className="text-[38px] leading-[1.02] [text-wrap:balance]">Let your work introduce you.</h1>
      <p className="muted text-base">Agents check the fit first. Names stay private until both sides say yes.</p>
    </div>
    <section aria-labelledby="how" className="space-y-2">
      <h2 id="how" className="text-[17px] font-semibold">How it works</h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
        <li>You get an agent: an AI that speaks for you, using your profile or your role.</li>
        <li>It talks with the other side&apos;s agent in a private room, with no names shared.</li>
        <li>If it fits, you both approve, and only then are names and contact details revealed.</li>
      </ol>
    </section>
    {message && <p role="alert" className="rounded-xl bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{message}</p>}
    <div className="grid gap-3">
      <a href="/talent/auth/google/start?as=work" className="flex min-h-[76px] items-center justify-between gap-3 rounded-[18px] bg-[var(--ink)] px-[18px] py-4 text-[var(--bg)] hover:bg-[#2b2b2b]">
        <span><span className="block text-[17px] font-semibold">I&apos;m looking for work</span><span className="block text-[13px] text-[#CFC8BD]">Continue with Google</span></span>
        <Arrow color="var(--sun)" />
      </a>
      <a href="/talent/auth/google/start?as=hire" className="flex min-h-[76px] items-center justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-[18px] py-4 hover:border-[var(--ink)]">
        <span><span className="block text-[17px] font-semibold">I&apos;m hiring</span><span className="muted block text-[13px]">Continue with Google</span></span>
        <Arrow color="var(--ink)" />
      </a>
    </div>
    <p className="muted mt-auto text-center text-[13px]">By continuing you agree to the <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy policy</a>.</p>
  </main>;
}
