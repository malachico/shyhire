import type { Metadata } from 'next';
import { AppIcon } from '@/components/Brand';
import { NavTabs } from '@/components/NavTabs';
import { currentSession } from '@/lib/auth';
import { switchMode } from '@/lib/actions/talent';
import { currentMode } from '@/lib/mode';
import { roomViews } from '@/lib/roomViews';

export const metadata: Metadata = { title: 'Shyhire', description: 'Let your work introduce you.', robots: { index: false, follow: false } };

export default async function TalentLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) return <div className="min-h-dvh">{children}</div>;
  const mode = await currentMode();
  // A dot on Conversations when one is waiting on this person (a question or an approval).
  const waiting = await roomViews().waitingCount(session.sub).catch(() => 0);
  const tabs = mode === 'hire'
    ? [{ href: '/talent/search', label: 'Hiring' }, { href: '/talent/conversations', label: 'Conversations' }]
    : [{ href: '/talent/profile', label: 'Profile' }, { href: '/talent/conversations', label: 'Conversations' }];
  const initial = (session.name || session.email || '?').trim().charAt(0).toUpperCase();
  return <div className="min-h-dvh">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
        <a href={tabs[0]!.href} aria-label="Shyhire"><AppIcon /></a>
        <NavTabs tabs={tabs} dot={waiting ? '/talent/conversations' : undefined} />
        <details className="relative">
          <summary aria-label="Account menu" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] text-sm font-medium">{initial}</summary>
          <div className="card absolute right-0 z-10 mt-2 w-60 space-y-1 p-2 text-sm">
            <p className="muted truncate px-2 py-1 text-xs">{session.email}</p>
            <form action={switchMode.bind(null, mode === 'hire' ? 'work' : 'hire')}>
              <button className="w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--bg)]">{mode === 'hire' ? 'Switch to looking for work' : 'Switch to hiring'}</button>
            </form>
            <form action="/talent/auth/signout" method="post">
              <button className="w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--bg)]">Sign out</button>
            </form>
          </div>
        </details>
      </nav>
    </header>
    {children}
  </div>;
}
