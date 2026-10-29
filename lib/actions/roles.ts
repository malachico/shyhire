'use server';
import { revalidatePath } from 'next/cache';
import { currentSession } from '../auth.ts';
import { TalentError } from '../profiles.ts';
import { roles } from '../talent.ts';

async function requirePersonId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new TalentError('unauthorized', 'Sign in first');
  return session.sub;
}

/** Opens a standing role: its agent starts talking to the best fits right away. */
export async function createRole(body: { title: string; looking: string; comp: string; mustHaves: string }): Promise<{ opened: number; error?: never } | { error: string }> {
  try {
    const { opened } = await roles().create(await requirePersonId(), body);
    revalidatePath('/talent/search');
    return { opened };
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}

export async function setRoleStatus(roleId: string, status: 'open' | 'paused' | 'closed'): Promise<{ ok: true; error?: never } | { error: string }> {
  try {
    await roles().setStatus(await requirePersonId(), roleId, status);
    revalidatePath('/talent/search');
    return { ok: true };
  } catch (error) {
    if (error instanceof TalentError) return { error: error.message };
    throw error;
  }
}
