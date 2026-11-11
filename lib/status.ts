import type { RoomStatus } from './parly.ts';

export type Tone = 'accent' | 'good' | 'plain';
/** The list filter a conversation falls under. */
export type Bucket = 'needs_me' | 'talking' | 'agreed' | 'ended';

/**
 * The plain-language outcome of a conversation, from what the viewer can see. No closing reason is stored,
 * so a passed conversation reads "not a fit"; a stuck one has nothing left for anyone to decide.
 */
export function statusOf(status: RoomStatus, o: { needsMe?: boolean; theyDecide?: boolean; summaryReady?: boolean; iApproved?: boolean } = {}): { label: string; tone: Tone; bucket: Bucket } {
  if (status === 'agreed') return { label: 'Agreed: contact details shared', tone: 'good', bucket: 'agreed' };
  if (status === 'closed') return { label: 'Closed: not a fit', tone: 'plain', bucket: 'ended' };
  if (status === 'stuck') return { label: "Stuck: the agents couldn't agree", tone: 'plain', bucket: 'ended' };
  if (o.needsMe) return { label: 'Needs your decision', tone: 'accent', bucket: 'needs_me' };
  if (status === 'needs_decision' || o.theyDecide) return { label: 'Waiting on the other side', tone: 'plain', bucket: 'talking' };
  if (o.summaryReady && o.iApproved) return { label: 'Agreed: waiting for their approval', tone: 'plain', bucket: 'agreed' };
  if (o.summaryReady) return { label: 'Agreed: waiting for your approval', tone: 'accent', bucket: 'needs_me' };
  return { label: 'Talking', tone: 'plain', bucket: 'talking' };
}

export const pillClass = (tone: Tone) => `pill ${tone === 'accent' ? 'pill-accent' : tone === 'good' ? 'pill-good' : ''}`;

export type Filter = 'all' | Bucket;
export type Sort = 'updated' | 'needs_me';

/** Filter then sort list rows: newest first, or the ones needing you first (then newest). Never mutates `rows`. */
export function filterSort<T extends { bucket: Bucket; updatedAt: string }>(rows: T[], filter: Filter, sort: Sort): T[] {
  const newest = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);
  return rows.filter((r) => filter === 'all' || r.bucket === filter)
    .sort(sort === 'needs_me' ? (a, b) => Number(b.bucket === 'needs_me') - Number(a.bucket === 'needs_me') || newest(a, b) : newest);
}
