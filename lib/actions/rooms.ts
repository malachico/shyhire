'use server';
import { revalidatePath } from 'next/cache';
import { currentSession } from '../auth.ts';
import { TalentError } from '../profiles.ts';
import { roomViews } from '../roomViews.ts';

async function requirePersonId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new TalentError('unauthorized', 'Sign in first');
  return String(session.githubId);
}

export async function openTalentRoom(
  candidateAlias: string,
  brief: { role: string; comp: string; mustHaves: string },
): Promise<{ id: string; status: string; error?: never } | { error: string; id?: never }> {
  try {
    const res = await roomViews().openRoom(await requirePersonId(), { candidateAlias, brief });
    revalidatePath('/talent/rooms');
    revalidatePath('/talent/requests');
    return res;
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function decideTalentRoom(
  roomId: string,
  choice: string,
): Promise<{ ok: true; error?: never } | { error: string; ok?: never }> {
  try {
    const res = await roomViews().decide(await requirePersonId(), roomId, choice);
    revalidatePath('/talent/rooms');
    revalidatePath('/talent/requests');
    revalidatePath(`/talent/rooms/${roomId}`);
    revalidatePath(`/talent/requests/${roomId}`);
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
    const res = await roomViews().approve(await requirePersonId(), roomId, version);
    revalidatePath('/talent/rooms');
    revalidatePath('/talent/requests');
    revalidatePath(`/talent/rooms/${roomId}`);
    revalidatePath(`/talent/requests/${roomId}`);
    return res;
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}
