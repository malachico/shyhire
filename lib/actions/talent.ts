'use server';
import { currentSession } from '../auth.ts';
import { TalentError } from '../profiles.ts';
import { profiles, workEmail, type TalentProfile } from '../talent.ts';

async function requirePersonId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new TalentError('unauthorized', 'Sign in first');
  return session.sub;
}

export async function saveTalentProfile(body: unknown): Promise<{ profile: TalentProfile; error?: never } | { error: string; profile?: never }> {
  try {
    return { profile: await profiles().save(await requirePersonId(), body) };
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function requestWorkEmail(email: string): Promise<{ sent: true; error?: never } | { error: string }> {
  try {
    return await workEmail().request(await requirePersonId(), email);
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function confirmWorkEmail(code: string): Promise<{ verified: true; error?: never } | { error: string }> {
  try {
    return await workEmail().confirm(await requirePersonId(), code);
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function setDiscoverable(open: boolean): Promise<{ profile: TalentProfile; error?: never } | { error: string; profile?: never }> {
  try {
    return { profile: await profiles().setPaused(await requirePersonId(), !open) };
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function switchMode(mode: unknown): Promise<void> {
  const { parseMode, setMode, homeOf } = await import('../mode.ts');
  const { redirect } = await import('next/navigation');
  const m = parseMode(mode);
  await setMode(m);
  redirect(homeOf(m));
}
