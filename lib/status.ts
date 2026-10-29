import type { RoomStatus } from './parly.ts';

export type Tone = 'accent' | 'good' | 'plain';

/** The one status a person sees for a conversation, in plain words (shared by the list and the detail page). */
export function statusOf(status: RoomStatus, o: { needsMe?: boolean; summaryReady?: boolean; iApproved?: boolean } = {}): { label: string; tone: Tone } {
  if (status === 'agreed') return { label: 'Matched', tone: 'good' };
  if (status === 'stuck' || status === 'closed') return { label: 'Ended', tone: 'plain' };
  if (o.needsMe) return { label: 'Needs you', tone: 'accent' };
  if (status === 'needs_decision') return { label: 'Waiting for them', tone: 'plain' };
  if (o.summaryReady && o.iApproved) return { label: 'Waiting for them', tone: 'plain' };
  if (o.summaryReady) return { label: 'Ready to approve', tone: 'accent' };
  return { label: 'Talking', tone: 'plain' };
}

export const pillClass = (tone: Tone) => `pill ${tone === 'accent' ? 'pill-accent' : tone === 'good' ? 'pill-good' : ''}`;
