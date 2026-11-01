'use server';
import { revalidatePath } from 'next/cache';
import { currentSession } from '../auth.ts';
import { TalentError } from '../profiles.ts';
import { roomViews } from '../roomViews.ts';
import { profiles } from '../talent.ts';

async function requirePersonId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new TalentError('unauthorized', 'Sign in first');
  return session.sub;
}

/** Keeps the address match emails go to; people signed in before it existed get it recorded here. */
async function rememberLoginEmail(): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  try {
    await profiles().recordContact(session.sub, { loginEmail: session.email });
  } catch {
    // Approving matters more than the email.
  }
}

export async function decideTalentRoom(
  roomId: string,
  choice: string,
): Promise<{ ok: true; error?: never } | { error: string; ok?: never }> {
  try {
    const res = await roomViews().decide(await requirePersonId(), roomId, choice);
    revalidatePath('/talent/conversations');
    revalidatePath(`/talent/conversations/${roomId}`);
    return res;
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function approveTalentRoom(
  roomId: string,
  version: number,
): Promise<{ ok: true; agreed: boolean; error?: never } | { error: string; ok?: never }> {
  try {
    await rememberLoginEmail();
    const res = await roomViews().approve(await requirePersonId(), roomId, version);
    revalidatePath('/talent/conversations');
    revalidatePath(`/talent/conversations/${roomId}`);
    return res;
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function passTalentRoom(roomId: string): Promise<{ ok: true; error?: never } | { error: string; ok?: never }> {
  try {
    const res = await roomViews().pass(await requirePersonId(), roomId);
    revalidatePath('/talent/conversations');
    revalidatePath(`/talent/conversations/${roomId}`);
    return res;
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}
