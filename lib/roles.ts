import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { db } from './db.ts';
import { callerOf, parseWorkModes, RateLimiter, TalentError, text, verifiedDomains, type Profiles, type RoleDraft, type TalentCaller, type TalentProfile, type WorkMode } from './profiles.ts';
import type { RoomStatus } from './parly.ts';
import type { CompanyRoomSummary, TalentRoomViews } from './roomViews.ts';

/** A company's standing role: its agent keeps finding good fits and talking to them until it's paused or closed. */
export interface Role {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  /** What they look for, in their words: what search ranks candidates against. */
  looking: string;
  /** Absent on roles from before these fields. */
  location?: string;
  workModes?: WorkMode[];
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
// A little under a day, so the daily cron never skips a role that was filled a few minutes later yesterday.
const DAY_MS = 20 * 60 * 60 * 1000;

/** What a company writes about a role, checked. */
function roleFields(raw: unknown): RoleDraft {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(body.title ?? '', 200, 'title');
  const looking = text(body.looking ?? '', 2000, 'What you look for');
  if (!title) throw new TalentError('invalid', 'Enter the role title');
  if (!looking) throw new TalentError('invalid', 'Describe who you are looking for');
  return { title, looking, location: text(body.location ?? '', 200, 'location'), workModes: parseWorkModes(body.workModes ?? []), comp: text(body.comp ?? '', 200, 'comp'), mustHaves: text(body.mustHaves ?? '', 2000, 'mustHaves') };
}

/** What a role's agent works from when it opens a conversation. */
const briefOf = (role: Role) => ({ role: role.title, comp: role.comp, mustHaves: [role.looking, role.mustHaves].filter(Boolean).join('\n'), location: role.location, workModes: role.workModes });

export class Roles {
  private readonly col;
  private readonly readLimiter = new RateLimiter(5, 60 * 60_000, 'role imports');
  private readonly profiles: Profiles;
  private readonly rooms: TalentRoomViews;
  constructor(profiles: Profiles, rooms: TalentRoomViews, store: Firestore = db()) {
    this.profiles = profiles;
    this.rooms = rooms;
    this.col = store.collection('talent_roles');
  }

  /** With `talkTo`, that candidate's conversation opens first; if it can't, the role isn't kept. */
  async create(caller: TalentCaller, raw: unknown, talkTo?: string): Promise<{ role: Role; opened: number; room?: { id: string; status: RoomStatus } }> {
    const { id: companyId } = callerOf(caller);
    const fields = roleFields(raw);
    const domains = await this.domainsOf(companyId);
    const now = new Date().toISOString();
    const ref = this.col.doc(randomUUID());
    const role: Role = { id: ref.id, companyId, companyName: domains[0]!, ...fields, status: 'open', contacted: [], createdAt: now, updatedAt: now };
    await ref.set(role);
    if (talkTo === undefined) return { role, opened: await this.fill(ref.id, FIRST_FILL) };
    const room = await this.talk(caller, ref.id, talkTo).catch(async (err) => { await ref.delete(); throw err; });
    const opened = await this.fill(ref.id, FIRST_FILL).catch((err) => { console.error(`role ${ref.id}: first fill failed`, err); return 0; });
    return { role, opened, room };
  }

  /** A recruiter's Talk: one conversation about a role they chose. Paused roles count; only auto-fill stops for them. */
  async talk(caller: TalentCaller, roleId: string, candidateAlias: string): Promise<{ id: string; status: RoomStatus }> {
    const ref = await this.owned(caller, roleId);
    const role = (await ref.get()).data() as Role;
    if (role.status === 'closed') throw new TalentError('invalid', 'That role is closed');
    // ponytail: only the 100 latest rooms are checked, same ceiling as fill; a per-candidate query if a company outgrows it.
    const already = (await this.rooms.listCompanyRooms(role.companyId)).find((r) => r.candidateAlias === candidateAlias);
    if (already) return { id: already.id, status: already.status };
    const room = await this.rooms.openRoom(role.companyId, { candidateAlias, roleId, brief: briefOf(role) });
    await ref.update({ contacted: FieldValue.arrayUnion(candidateAlias) });
    return room;
  }

  /** Fills the role form from a pasted job description; nothing is stored. */
  async readDescription(caller: TalentCaller, raw: unknown): Promise<RoleDraft> {
    const { id } = callerOf(caller);
    const description = text(raw, 40000, 'Job description');
    if (!description) throw new TalentError('invalid', 'Paste the job description first');
    await this.domainsOf(id);
    if (!this.profiles.roleReader) throw new TalentError('unsupported', 'Reading job descriptions is not available right now. Fill in the form yourself.');
    this.readLimiter.hit(id);
    return this.profiles.roleReader(id, description);
  }

  /** Finds good fits not yet contacted and opens a conversation with each, up to `max`. Answers how many it opened. */
  async fill(roleId: string, max: number): Promise<number> {
    const role = (await this.col.doc(roleId).get()).data() as Role | undefined;
    if (!role || role.status !== 'open') return 0;
    const { profiles } = await this.profiles.search(role.companyId, [role.title, role.location, role.workModes?.join(', '), role.looking, role.mustHaves].filter(Boolean).join('. ').slice(0, 1000));
    // Anyone this company already talks to, for any role, isn't contacted again.
    const busy = new Set([...role.contacted, ...(await this.rooms.listCompanyRooms(role.companyId)).map((r) => r.candidateAlias)]);
    // ponytail: keyword-search results have no score, so they never auto-open; only the AI search does.
    const picks = profiles.filter((p) => p.score !== undefined && p.score >= MIN_FIT && !busy.has(p.alias)).slice(0, max);
    let opened = 0;
    for (const p of picks) {
      try {
        await this.rooms.openRoom(role.companyId, { candidateAlias: p.alias, roleId, brief: briefOf(role) });
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
    return snap.docs.map((d) => d.data() as Role)
      .sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || b.createdAt.localeCompare(a.createdAt))
      .map((role) => ({ ...role, stats: statsOf(rooms.filter((r) => r.roleId === role.id)) }));
  }

  async setStatus(caller: TalentCaller, roleId: string, status: unknown): Promise<void> {
    if (status !== 'open' && status !== 'paused' && status !== 'closed') throw new TalentError('invalid', 'Status is open, paused or closed');
    await (await this.owned(caller, roleId)).update({ status, updatedAt: new Date().toISOString() });
  }

  /** Conversations already started keep the brief they opened with; new ones use this. */
  async update(caller: TalentCaller, roleId: string, raw: unknown): Promise<void> {
    const fields = roleFields(raw);
    await (await this.owned(caller, roleId)).update({ ...fields, updatedAt: new Date().toISOString() });
  }

  private async domainsOf(companyId: string): Promise<string[]> {
    const own = (await this.profiles.get(companyId)) as TalentProfile | undefined;
    const domains = verifiedDomains(own?.verified ?? []);
    if (!domains.length) throw new TalentError('forbidden', 'Verify your work email before opening a role');
    return domains;
  }

  private async owned(caller: TalentCaller, roleId: string) {
    const { id } = callerOf(caller);
    if (typeof roleId !== 'string' || !/^[a-f0-9-]{36}$/.test(roleId)) throw new TalentError('not_found', 'No such role');
    const ref = this.col.doc(roleId);
    const role = (await ref.get()).data() as Role | undefined;
    if (!role || role.companyId !== id) throw new TalentError('not_found', 'No such role');
    return ref;
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
