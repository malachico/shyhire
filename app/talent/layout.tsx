import type { Metadata } from 'next';
import { currentSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Parly Talent', description: 'Let your work introduce you.', robots: { index: false, follow: false } };

export default async function TalentLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  return <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
    <header className="border-b border-[var(--border)]"><nav aria-label="Talent" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
      <a href="/talent/profile" className="text-lg font-semibold tracking-tight">Parly <span className="font-normal text-[var(--muted)]">Talent</span></a>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a href="/talent/search">Find candidates</a>
        <a href="/talent/rooms">Company rooms</a>
        <a href="/talent/requests">Requests</a>
        <a href="/talent/profile">Your profile</a>
        {session && <form action="/talent/auth/signout" method="post"><button className="btn">Sign out</button></form>}
      </div>
    </nav></header>
    {children}
  </div>;
}
