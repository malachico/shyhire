import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { db } from './db.ts';
import { callerOf, TalentError, text, verifiedDomains, type Profiles, type TalentCaller, type TalentProfile } from './profiles.ts';
import type { CompanyRoomSummary, TalentRoomViews } from './roomViews.ts';

/** A company's standing role: its agent keeps finding good fits and talking to them until it's paused or closed. */
export interface Role {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  /** What they look for, in their words: what search ranks candidates against. */
  looking: string;
  comp: string;
  /** Private to their agent. */
  mustHaves: string;
  status: 'open' | 'paused' | 'closed';
  /** Candidates already contacted for this role: never twice. */
  contacted: string[];
  createdAt: string;
  updatedAt: string;
  lastFillAt?: string;
}

export interface RoleView extends Role {
  stats: { talking: number; needsYou: number; matched: number; total: number };
}

/** Conversations a new role opens right away, then a few more a day. */
export const FIRST_FILL = 10, DAILY_FILL = 3;
/** Only candidates the search scores at least this (0-100) get contacted. */
export const MIN_FIT = 60;
const DAY_MS = 20 * 60 * 60 * 1000;

export class Roles {
  private readonly col;
  private readonly profiles: Profiles;
  private readonly rooms: TalentRoomViews;
  constructor(profiles: Profiles, rooms: TalentRoomViews, store: Firestore = db()) {
    this.profiles = profiles;
    this.rooms = rooms;
    this.col = store.collection('talent_roles');
  }

  async create(caller: TalentCaller, raw: unknown): Promise<{ role: Role; opened: number }> {
    const { id: companyId } = callerOf(caller);
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const title = text(body.title ?? '', 200, 'title');
    const looking = text(body.looking ?? '', 2000, 'What you look for');
    if (!title) throw new TalentError('invalid', 'Enter the role title');
    if (!looking) throw new TalentError('invalid', 'Describe who you are looking for');
    const own = (await this.profiles.get(companyId)) as TalentProfile | undefined;
    const domains = verifiedDomains(own?.verified ?? []);
    if (!domains.length) throw new TalentError('forbidden', 'Verify your work email before opening a role');
    const now = new Date().toISOString();
    const ref = this.col.doc(randomUUID());
    const role: Role = { id: ref.id, companyId, companyName: domains[0]!, title, looking, comp: text(body.comp ?? '', 200, 'comp'), mustHaves: text(body.mustHaves ?? '', 2000, 'mustHaves'), status: 'open', contacted: [], createdAt: now, updatedAt: now };
    await ref.set(role);
    return { role, opened: await this.fill(ref.id, FIRST_FILL) };
  }

  /** Finds good fits not yet contacted and opens a conversation with each, up to `max`. Answers how many it opened. */
  async fill(roleId: string, max: number): Promise<number> {
    const role = (await this.col.doc(roleId).get()).data() as Role | undefined;
    if (!role || role.status !== 'open') return 0;
    const { profiles } = await this.profiles.search(role.companyId, [role.title, role.looking, role.mustHaves].filter(Boolean).join('. '));
    // Anyone this company already talks to, for any role, isn't contacted again.
    const busy = new Set([...role.contacted, ...(await this.rooms.listCompanyRooms(role.companyId)).map((r) => r.candidateAlias)]);
    // ponytail: keyword-search results have no score, so they never auto-open; only the AI search does.
    const picks = profiles.filter((p) => p.score !== undefined && p.score >= MIN_FIT && !busy.has(p.alias)).slice(0, max);
    let opened = 0;
    for (const p of picks) {
      try {
        await this.rooms.openRoom(role.companyId, { candidateAlias: p.alias, roleId, brief: { role: role.title, comp: role.comp, mustHaves: [role.looking, role.mustHaves].filter(Boolean).join('\n') } });
        await this.col.doc(roleId).update({ contacted: FieldValue.arrayUnion(p.alias) });
        opened++;
      } catch (err) {
        console.error(`role ${roleId}: could not open a conversation with ${p.alias}`, err);
      }
    }
    await this.col.doc(roleId).update({ lastFillAt: new Date().toISOString() });
    return opened;
  }

  /** The daily top-up: each open role not filled in the last day gets a few more conversations. */
  async fillAll(now = Date.now()): Promise<{ roles: number; opened: number }> {
    const open = await this.col.where('status', '==', 'open').get();
    let roles = 0, opened = 0;
    for (const doc of open.docs) {
      const role = doc.data() as Role;
      if (role.lastFillAt && now - Date.parse(role.lastFillAt) < DAY_MS) continue;
      roles++;
      opened += await this.fill(doc.id, DAILY_FILL);
    }
    return { roles, opened };
  }

  async list(caller: TalentCaller): Promise<RoleView[]> {
    const { id } = callerOf(caller);
    const [snap, rooms] = await Promise.all([this.col.where('companyId', '==', id).get(), this.rooms.listCompanyRooms(id)]);
    return snap.docs.map((d) => d.data() as Role).filter((r) => r.status !== 'closed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((role) => ({ ...role, stats: statsOf(rooms.filter((r) => r.roleId === role.id)) }));
  }

  async setStatus(caller: TalentCaller, roleId: string, status: unknown): Promise<void> {
    const { id } = callerOf(caller);
    if (status !== 'open' && status !== 'paused' && status !== 'closed') throw new TalentError('invalid', 'Status is open, paused or closed');
    const ref = this.col.doc(roleId);
    const role = (await ref.get()).data() as Role | undefined;
    if (!role || role.companyId !== id) throw new TalentError('not_found', 'No such role');
    await ref.update({ status, updatedAt: new Date().toISOString() });
  }
}

function statsOf(rooms: CompanyRoomSummary[]): RoleView['stats'] {
  const live = rooms.filter((r) => r.status !== 'closed' && r.status !== 'stuck');
  return {
    total: rooms.length,
    matched: rooms.filter((r) => r.status === 'agreed').length,
    needsYou: rooms.filter((r) => !!r.needsDecision || (r.documentVersion !== undefined && !r.iApproved && r.status !== 'agreed')).length,
    talking: live.filter((r) => r.status === 'talking' || r.status === 'needs_decision').length,
  };
}
