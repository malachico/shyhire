import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { db } from './db.ts';
import { redact } from './privacy.ts';
import { parly, ParlyError, type Room, type RoomMessage, type RoomStatus, type SideInput } from './parly.ts';
import { callerOf, domainBlocked, TalentError, text, verifiedDomains, type CvDetails, type TalentCaller, type TalentProfile } from './profiles.ts';

export type RoomSideKind = 'company' | 'candidate';

export interface TalentRoomBrief {
  role: string;
  comp: string;
  mustHaves: string;
}

export interface TalentRoomDecision {
  side: RoomSideKind;
  question: string;
  options: string[];
}

export interface TalentRevealedContact {
  side: RoomSideKind;
  displayName: string;
  email?: string;
  githubLogin?: string;
  githubUrl?: string;
  verifiedDomains: string[];
}

export interface StoredTalentRoom {
  companyId: string;
  companyName: string;
  candidateId: string;
  candidateAlias: string;
  brief?: Partial<TalentRoomBrief>;
  /** The standing role this conversation was opened for, if any. */
  roleId?: string;
  status: RoomStatus;
  needsDecision?: TalentRoomDecision;
  documentVersion?: number;
  createdAt: string;
  updatedAt: string;
  lastEventId?: string;
  seenEventIds?: string[];
}

export interface CompanyRoomSummary {
  id: string;
  companyName: string;
  candidateAlias: string;
  brief: TalentRoomBrief;
  roleId?: string;
  status: RoomStatus;
  waitingOn?: RoomSideKind;
  needsDecision?: { side: 'company'; question: string; options: string[] };
  documentVersion?: number;
  /** This person approved the current summary version. */
  iApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One row of the Conversations list, from either side. */
export interface ConversationRow {
  id: string;
  side: RoomSideKind;
  /** The other side as this person may see it: a candidate's alias, or the company's name. */
  title: string;
  role?: string;
  status: RoomStatus;
  needsMe: boolean;
  documentVersion?: number;
  iApproved: boolean;
  updatedAt: string;
}

export interface CandidateRequestSummary {
  id: string;
  companyName: string;
  candidateAlias: string;
  status: RoomStatus;
  waitingOn?: RoomSideKind;
  needsDecision?: { side: 'candidate'; question: string; options: string[] };
  documentVersion?: number;
  /** This person approved the current summary version. */
  iApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TalentRoomDocumentView {
  version: number;
  text: string;
  myApproved: boolean;
  otherApproved: boolean;
  myApprovedAt?: string;
  otherApprovedAt?: string;
}

export interface TalentRoomDetail {
  id: string;
  viewerSide: RoomSideKind;
  companyName: string;
  candidateAlias: string;
  brief?: TalentRoomBrief;
  goal: string;
  status: RoomStatus;
  waitingOn?: RoomSideKind;
  needsDecision?: TalentRoomDecision;
  document?: TalentRoomDocumentView;
  revealedContact?: TalentRevealedContact;
  messages: RoomMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ParlyRoomsClient {
  createAgent?: (key: string, name: string, instructions: string) => Promise<{ key: string; name: string }>;
  putAgent?: (key: string, agent: { name: string; instructions: string; card?: string; listed?: boolean }) => Promise<{ key: string; name: string }>;
  openRoom?: (body: { goal: string; sides: [SideInput, SideInput]; metadata?: Record<string, string> }) => Promise<{ id: string; status: RoomStatus }>;
  getRoom: (roomId: string) => Promise<Room>;
  messages: (roomId: string, side: string, after?: string) => Promise<{ messages: RoomMessage[] }>;
  decide: (roomId: string, decisionId: string, choice: string) => Promise<{ ok: true }>;
  approve: (roomId: string, side: string, version: number) => Promise<{ ok: true; agreed: boolean }>;
  close?: (roomId: string) => Promise<{ ok: true }>;
}

const HIRING_AGENT_KEY = 'hiring-rep';
const CANDIDATE_AGENT_KEY = 'candidate-rep';
const HIRING_AGENT_INSTRUCTIONS =
  'You represent the hiring company in an anonymous Shyhire conversation. Evaluate mutual role, technical, compensation, and working-mode fit against your private brief without asking for or revealing personal identifiers. Use ASK MY SIDE when you need a decision from the hiring team, and draft/update the shared fit summary once fit is clear.';
const CANDIDATE_AGENT_INSTRUCTIONS =
  'You represent the candidate in an anonymous Shyhire conversation. Protect candidate anonymity strictly: never reveal names, employers, URLs, or raw private text. Evaluate mutual fit against your private brief. Never state their minimum or current pay, or any number from the private brief, in the conversation or the shared summary: say only whether an offer is within, near or below what they look for. Use ASK MY SIDE when a decision is needed from the candidate, and draft/update the shared fit summary once fit is clear.';

/** A candidate's own agent in Parly: one per candidate, named by their alias ("Candidate #1a2b3c4d" → "cand-1a2b3c4d"). */
export const candidateAgentKey = (alias: string) => `cand-${alias.replace(/^Candidate #/i, '').toLowerCase().slice(0, 30)}`;

/** Everything the candidate's own agent knows: what companies see, then the private parts it never quotes. */
export function candidateBrief(p: TalentProfile): string {
  const preferenceLines = formatCandidatePreferencesBrief(p);
  // The agent can't repeat what it was never told: employers, links and emails are blanked before it sees them.
  const clean = (s: string) => redact(s, [...p.experience.map((r) => r.company), ...p.employerDomains]);
  const roles = p.experience.filter((r) => !r.hidden).slice(0, 15)
    .map((r) => `- ${clean(r.title)}${r.start || r.end ? ` (${r.start || '?'}–${r.end || 'Present'})` : ''}${r.description ? `: ${clean(r.description.slice(0, 300))}` : ''}`);
  return [
    p.publicSummary,
    details(p.details),
    roles.length ? `Self-reported roles (employer names withheld; never reveal names, employers or contact details):\n${roles.join('\n')}` : '',
    p.openTo ? `Open to: ${clean(p.openTo)}` : '',
    preferenceLines.length ? `Private candidate preferences (never quote raw text; use to evaluate fit and decide):\n${preferenceLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 6000);
}

/** CV details as brief lines for the candidate's own agent. */
function details(d?: CvDetails): string {
  if (!d) return '';
  const lines = [
    d.years !== undefined ? `Years of experience: ${d.years}` : '', d.seniority ? `Seniority: ${d.seniority}` : '',
    d.industries.length ? `Industries: ${d.industries.join(', ')}` : '', d.skills.length ? `Skills: ${d.skills.join(', ')}` : '',
    d.leadership ? `Leadership: ${d.leadership}` : '', d.education ? `Education: ${d.education}` : '',
    d.languages.length ? `Languages: ${d.languages.join(', ')}` : '', d.certifications.length ? `Certifications: ${d.certifications.join(', ')}` : '',
  ].filter(Boolean);
  return lines.length ? `Self-reported CV details:\n${lines.join('\n')}` : '';
}

const VALID_STATUSES = new Set<RoomStatus>(['talking', 'needs_decision', 'agreed', 'stuck', 'closed']);

function normalizeStatus(raw: unknown): RoomStatus {
  return typeof raw === 'string' && VALID_STATUSES.has(raw as RoomStatus) ? (raw as RoomStatus) : 'talking';
}

function normalizeBrief(raw: unknown): TalentRoomBrief {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    role: typeof obj.role === 'string' ? obj.role : '',
    comp: typeof obj.comp === 'string' ? obj.comp : '',
    mustHaves: typeof obj.mustHaves === 'string' ? obj.mustHaves : '',
  };
}

function normalizeDecision(raw: unknown): TalentRoomDecision | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.side !== 'company' && obj.side !== 'candidate') return undefined;
  const question = typeof obj.question === 'string' ? obj.question.trim() : '';
  if (!question) return undefined;
  const options = Array.isArray(obj.options)
    ? obj.options.filter((o): o is string => typeof o === 'string' && Boolean(o.trim())).map((o) => o.trim())
    : [];
  return { side: obj.side, question, options };
}

function resolveParlySideRef(side: RoomSideKind, room: Room | undefined, record: StoredTalentRoom): string {
  if (!room?.sides?.length) return side;
  if (room.sides.some((s) => s.ref === side)) return side;
  const targetName = side === 'company' ? record.companyName : record.candidateAlias;
  const byName = room.sides.find((s) => s.name === targetName);
  if (byName) return byName.ref;
  if (room.sides.length === 2) return side === 'company' ? room.sides[0]!.ref : room.sides[1]!.ref;
  return side;
}

function sideKindOfRef(ref: string, room: Room | undefined, record: StoredTalentRoom): RoomSideKind | undefined {
  if (ref === 'company' || ref === 'candidate') return ref;
  if (ref === resolveParlySideRef('company', room, record)) return 'company';
  if (ref === resolveParlySideRef('candidate', room, record)) return 'candidate';
  return undefined;
}

export function formatCandidatePreferencesBrief(profile: Partial<TalentProfile>): string[] {
  const lines: string[] = [];
  const min =
    typeof profile.salary?.min === 'number' && Number.isFinite(profile.salary.min) && profile.salary.min > 0
      ? profile.salary.min
      : typeof profile.salaryMin === 'number' && Number.isFinite(profile.salaryMin) && profile.salaryMin > 0
        ? profile.salaryMin
        : undefined;
  const currency = (profile.salary?.currency || profile.salaryCurrency || 'USD').trim().toUpperCase();
  if (min !== undefined) {
    lines.push(`Salary: minimum ${min} ${currency} (private: never share the number)`);
  }
  const locs = Array.isArray(profile.locations)
    ? profile.locations.map((l) => String(l).trim()).filter(Boolean)
    : [];
  const modes = Array.isArray(profile.workModes)
    ? (['remote', 'hybrid', 'onsite'] as const).filter((m) => profile.workModes!.includes(m))
    : [];
  if (locs.length || modes.length) {
    const parts: string[] = [];
    if (locs.length) parts.push(locs.join(', '));
    if (modes.length) parts.push(modes.join(', '));
    lines.push(`Locations: ${parts.join(' · ')}`);
  }
  const noGos = typeof profile.noGos === 'string' ? profile.noGos.trim() : '';
  if (noGos) {
    lines.push(`No-gos: ${noGos}`);
  }
  const legacy = typeof profile.preferences === 'string' ? profile.preferences.trim() : '';
  if (legacy && legacy !== noGos) {
    lines.push(`Additional preferences: ${legacy}`);
  }
  return lines;
}

function rethrowParlyError(err: unknown): never {
  if (err instanceof TalentError) throw err;
  if (err instanceof ParlyError) {
    if (err.status === 404) throw new TalentError('not_found', 'Room not found');
    if (err.status === 400) throw new TalentError('invalid', err.message);
    if (err.status === 409) throw new TalentError('conflict', err.message);
    throw new TalentError('unavailable', err.message);
  }
  throw err;
}

export class TalentRoomViews {
  private readonly store: Firestore;
  private readonly parlyClient: ParlyRoomsClient;
  private readonly col;
  private agentsEnsured = false;

  constructor(
    store: Firestore = db(),
    parlyClient: ParlyRoomsClient = parly,
  ) {
    this.store = store;
    this.parlyClient = parlyClient;
    this.col = this.store.collection('talent_rooms');
  }

  /**
   * Keeps the candidate's own Parly agent in step with their profile: what companies see is its card, the rest its
   * private instructions. Listed (found by search) only while they're open to conversations.
   */
  async syncCandidate(p: TalentProfile): Promise<boolean> {
    if (!this.parlyClient.putAgent || !/^Candidate #[a-f0-9]{8,36}$/i.test(p.alias)) return false;
    await this.parlyClient.putAgent(candidateAgentKey(p.alias), {
      name: p.alias,
      instructions: `${CANDIDATE_AGENT_INSTRUCTIONS}\n\nAbout the candidate you represent:\n${candidateBrief(p)}`,
      card: p.publicSummary.slice(0, 2000),
      listed: p.searchable === true && !p.paused && p.version > 0,
    });
    return true;
  }

  private async ensureAgentTemplates(): Promise<void> {
    if (this.agentsEnsured || !this.parlyClient.createAgent) return;
    await Promise.all([
      this.parlyClient.createAgent(HIRING_AGENT_KEY, 'Hiring representative', HIRING_AGENT_INSTRUCTIONS),
      this.parlyClient.createAgent(CANDIDATE_AGENT_KEY, 'Candidate representative', CANDIDATE_AGENT_INSTRUCTIONS),
    ]);
    this.agentsEnsured = true;
  }

  private async resolveRevealedContact(targetSide: RoomSideKind, record: StoredTalentRoom): Promise<TalentRevealedContact> {
    const personId = targetSide === 'company' ? String(record.companyId ?? '') : String(record.candidateId ?? '');
    const [contactSnap, emailSnap, profileSnap] = await Promise.all([
      personId ? this.store.collection('talent_contacts').doc(personId).get() : Promise.resolve(undefined),
      personId ? this.store.collection('talent_email_challenges').doc(personId).get() : Promise.resolve(undefined),
      personId ? this.store.collection('profiles').doc(personId).get() : Promise.resolve(undefined),
    ]);
    const contactData = (contactSnap?.data() ?? {}) as { githubLogin?: unknown; workEmail?: unknown; domain?: unknown };
    const emailChallenge = (emailSnap?.data() ?? {}) as { email?: unknown; domain?: unknown; consumed?: unknown };
    const profile = profileSnap?.data() as TalentProfile | undefined;

    const githubLogin = typeof contactData.githubLogin === 'string' && contactData.githubLogin.trim()
      ? contactData.githubLogin.trim()
      : undefined;
    const email = typeof contactData.workEmail === 'string' && contactData.workEmail.trim()
      ? contactData.workEmail.trim()
      : emailChallenge.consumed === true && typeof emailChallenge.email === 'string' && emailChallenge.email.trim()
        ? emailChallenge.email.trim()
        : undefined;
    const domains = new Set<string>(verifiedDomains(profile?.verified ?? []));
    if (typeof contactData.domain === 'string' && contactData.domain.trim()) domains.add(contactData.domain.trim().toLowerCase());
    if (emailChallenge.consumed === true && typeof emailChallenge.domain === 'string' && emailChallenge.domain.trim()) {
      domains.add(emailChallenge.domain.trim().toLowerCase());
    }
    if (targetSide === 'company' && record.companyName) domains.add(record.companyName.toLowerCase());

    const displayName = targetSide === 'company'
      ? record.companyName || (githubLogin ? `@${githubLogin}` : 'Company')
      : githubLogin
        ? `@${githubLogin}`
        : email ?? record.candidateAlias;

    return {
      side: targetSide,
      displayName,
      ...(email ? { email } : {}),
      ...(githubLogin ? { githubLogin, githubUrl: `https://github.com/${githubLogin}` } : {}),
      verifiedDomains: [...domains],
    };
  }

  /**
   * Opens a room from a candidate search result with a private company brief (`role`, `comp`, `mustHaves`).
   * Calls `POST /v1/rooms` with opaque refs (`company` and `candidate`) and stores `talent_rooms/{parlyRoomId}`.
   */
  async openRoom(caller: TalentCaller, raw: unknown): Promise<{ id: string; status: RoomStatus }> {
    const { id: companyId } = callerOf(caller, 'Sign in as a person to open a room');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TalentError('invalid', 'Expected room details');
    const body = raw as Record<string, unknown>;
    const candidateAlias = text(body.candidateAlias ?? body.alias ?? '', 80, 'candidateAlias');
    if (!/^Candidate #[a-f0-9]{8,36}$/i.test(candidateAlias)) {
      throw new TalentError('invalid', 'Valid candidate alias is required');
    }

    const rawBrief = body.brief && typeof body.brief === 'object' && !Array.isArray(body.brief)
      ? (body.brief as Record<string, unknown>)
      : body;
    const role = text(rawBrief.role ?? '', 200, 'role');
    if (!role) throw new TalentError('invalid', 'Enter the role title');
    const comp = text(rawBrief.comp ?? '', 200, 'comp');
    const mustHaves = text(rawBrief.mustHaves ?? '', 2000, 'mustHaves');

    const companyProfile = (await this.store.collection('profiles').doc(companyId).get()).data() as TalentProfile | undefined;
    const companyDomains = verifiedDomains(companyProfile?.verified ?? []);
    if (!companyDomains.length) {
      throw new TalentError('forbidden', 'Verify your work email before opening a room');
    }
    const companyName = companyDomains[0]!;

    const candidateSnap = await this.store.collection('profiles').where('alias', '==', candidateAlias).limit(5).get();
    const candidateDoc = candidateSnap.docs.find((d) => (d.data() as TalentProfile).searchable === true && !(d.data() as TalentProfile).paused);
    if (!candidateDoc || candidateDoc.id === companyId) {
      throw new TalentError('not_found', 'Candidate not found');
    }
    const candidateProfile = candidateDoc.data() as TalentProfile;
    if ((candidateProfile.employerDomains ?? []).some((d) => domainBlocked(d, companyDomains))) {
      throw new TalentError('not_found', 'Candidate not found');
    }

    if (!this.parlyClient.openRoom) {
      throw new TalentError('unavailable', 'Room creation is not configured');
    }

    const companyBriefText = [
      `Company: ${companyName}`,
      `Role: ${role}`,
      comp ? `Compensation band: ${comp}` : '',
      mustHaves ? `Must-haves and private notes: ${mustHaves}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const candidateBriefText = candidateBrief(candidateProfile);

    const goal = `Evaluate fit: ${companyName} (${role}) × ${candidateProfile.alias}`.slice(0, 200);
    // The candidate's own agent when Parly has it (it carries their brief); else the shared template with the brief.
    const ownAgent = await this.syncCandidate(candidateProfile).catch((err) => { console.error('candidate agent sync', err); return false; });
    const sides: [SideInput, SideInput] = [
      { ref: 'company', name: companyName.slice(0, 60), brief: companyBriefText.slice(0, 4000), agent: HIRING_AGENT_KEY },
      ownAgent
        ? { ref: 'candidate', name: candidateProfile.alias.slice(0, 60), brief: '', agent: candidateAgentKey(candidateProfile.alias) }
        : { ref: 'candidate', name: candidateProfile.alias.slice(0, 60), brief: candidateBriefText.slice(0, 4000), agent: CANDIDATE_AGENT_KEY },
    ];
    const roleId = typeof body.roleId === 'string' && /^[a-f0-9-]{36}$/.test(body.roleId) ? body.roleId : undefined;

    try {
      await this.ensureAgentTemplates();
      let opened: { id: string; status: RoomStatus };
      try {
        opened = await this.parlyClient.openRoom({ goal, sides, ...(roleId ? { metadata: { role_id: roleId } } : {}) });
      } catch (err) {
        if (err instanceof ParlyError && err.status === 400 && /No agent/i.test(err.message) && this.parlyClient.createAgent) {
          this.agentsEnsured = false;
          await this.ensureAgentTemplates();
          opened = await this.parlyClient.openRoom({ goal, sides, ...(roleId ? { metadata: { role_id: roleId } } : {}) });
        } else {
          throw err;
        }
      }
      const now = new Date().toISOString();
      const status = normalizeStatus(opened.status);
      const record: StoredTalentRoom = {
        companyId,
        companyName,
        candidateId: candidateDoc.id,
        candidateAlias: candidateProfile.alias,
        brief: { role, comp, mustHaves },
        ...(roleId ? { roleId } : {}),
        status,
        createdAt: now,
        updatedAt: now,
      };
      await this.col.doc(opened.id).set(record);
      return { id: opened.id, status };
    } catch (err) {
      rethrowParlyError(err);
    }
  }

  /**
   * Processes a signed Parly room webhook (`needs_decision`, `document_updated`, `agreed`, `stuck`, `closed`).
   * Idempotent on `event.id` (`lastEventId` / `seenEventIds`).
   */
  async handleWebhookEvent(raw: unknown): Promise<{ ok: true; duplicate?: boolean; ignored?: boolean }> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TalentError('invalid', 'Invalid webhook payload');
    }
    const evt = raw as Record<string, unknown>;
    const eventId = text(evt.id ?? '', 200, 'id');
    const rawType = text(evt.type ?? '', 80, 'type');
    if (!eventId || !rawType) throw new TalentError('invalid', 'Webhook event id and type are required');
    const kind = rawType.startsWith('room.') ? rawType.slice('room.'.length) : rawType;
    const data = evt.data && typeof evt.data === 'object' && !Array.isArray(evt.data)
      ? (evt.data as Record<string, unknown>)
      : {};
    const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : '';
    if (!roomId) return { ok: true, ignored: true };

    const ref = this.col.doc(roomId);
    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: true, ignored: true };
      const current = snap.data() as StoredTalentRoom;
      const seen = Array.isArray(current.seenEventIds) ? current.seenEventIds : [];
      if (current.lastEventId === eventId || seen.includes(eventId)) {
        return { ok: true, duplicate: true };
      }

      const now = new Date().toISOString();
      const nextSeen = [...seen.slice(-49), eventId];
      const updates: Record<string, unknown> = {
        lastEventId: eventId,
        seenEventIds: nextSeen,
        updatedAt: now,
      };

      if (kind === 'needs_decision') {
        const side = sideKindOfRef(typeof data.side === 'string' ? data.side : '', undefined, current);
        const question = typeof data.question === 'string' ? data.question.trim() : '';
        const options = Array.isArray(data.options)
          ? data.options.filter((o): o is string => typeof o === 'string' && Boolean(o.trim())).map((o) => o.trim())
          : [];
        if (side && question) {
          updates.status = 'needs_decision';
          updates.needsDecision = { side, question, options };
        }
      } else if (kind === 'document_updated') {
        if (typeof data.version === 'number' && Number.isInteger(data.version) && data.version > 0) {
          updates.documentVersion = data.version;
        }
        if (current.status === 'needs_decision') {
          updates.status = 'talking';
          updates.needsDecision = FieldValue.delete();
        }
      } else if (kind === 'agreed') {
        updates.status = 'agreed';
        updates.needsDecision = FieldValue.delete();
        if (typeof data.version === 'number' && Number.isInteger(data.version) && data.version > 0) {
          updates.documentVersion = data.version;
        }
      } else if (kind === 'stuck') {
        updates.status = 'stuck';
        updates.needsDecision = FieldValue.delete();
      } else if (kind === 'closed') {
        updates.status = 'closed';
        updates.needsDecision = FieldValue.delete();
      } else {
        return { ok: true, ignored: true };
      }

      tx.set(ref, updates, { merge: true });
      return { ok: true };
    });
  }

  private async loadForViewer(
    caller: TalentCaller,
    rawRoomId: string,
  ): Promise<{ id: string; viewerSide: RoomSideKind; record: StoredTalentRoom }> {
    const { id: personId } = callerOf(caller, 'Sign in as a person to view rooms');
    const roomId = text(rawRoomId, 120, 'roomId');
    if (!roomId) throw new TalentError('not_found', 'Room not found');
    const snap = await this.col.doc(roomId).get();
    if (!snap.exists) throw new TalentError('not_found', 'Room not found');
    const data = snap.data() as StoredTalentRoom;
    const companyId = String(data.companyId ?? '');
    const candidateId = String(data.candidateId ?? '');
    let viewerSide: RoomSideKind;
    if (companyId && companyId === personId) {
      viewerSide = 'company';
    } else if (candidateId && candidateId === personId) {
      viewerSide = 'candidate';
    } else {
      throw new TalentError('not_found', 'Room not found');
    }
    return { id: snap.id, viewerSide, record: data };
  }

  /** Both sides' rooms in one list (the person may hire and look for work): waiting on them first, then newest. */
  async listConversations(caller: TalentCaller): Promise<ConversationRow[]> {
    const [hiring, offers] = await Promise.all([this.listCompanyRooms(caller), this.listCandidateRequests(caller)]);
    const rows: ConversationRow[] = [
      ...hiring.map((r) => ({ id: r.id, side: 'company' as const, title: r.candidateAlias, role: r.brief.role, status: r.status, needsMe: !!r.needsDecision, documentVersion: r.documentVersion, iApproved: r.iApproved, updatedAt: r.updatedAt })),
      ...offers.map((r) => ({ id: r.id, side: 'candidate' as const, title: r.companyName, status: r.status, needsMe: !!r.needsDecision, documentVersion: r.documentVersion, iApproved: r.iApproved, updatedAt: r.updatedAt })),
    ];
    return rows.sort((a, b) => Number(b.needsMe) - Number(a.needsMe) || b.updatedAt.localeCompare(a.updatedAt));
  }

  /** How many conversations are waiting on this person's answer (the nav's dot). */
  async waitingCount(caller: TalentCaller): Promise<number> {
    return (await this.listConversations(caller)).filter((r) => r.needsMe).length;
  }

  /** Company rooms (`companyId == me`, newest first). Never exposes `candidateId` or candidate-side decision details. */
  async listCompanyRooms(caller: TalentCaller): Promise<CompanyRoomSummary[]> {
    const { id: personId } = callerOf(caller, 'Sign in as a person to view rooms');
    const snap = await this.col.where('companyId', '==', personId).orderBy('updatedAt', 'desc').limit(100).get();
    return snap.docs.map((doc) => {
      const data = doc.data() as StoredTalentRoom;
      const decision = normalizeDecision(data.needsDecision);
      const status = normalizeStatus(data.status);
      const waitingOn = status === 'needs_decision' ? decision?.side : undefined;
      return {
        id: doc.id,
        companyName: typeof data.companyName === 'string' ? data.companyName : '',
        candidateAlias: typeof data.candidateAlias === 'string' ? data.candidateAlias : '',
        brief: normalizeBrief(data.brief),
        ...(data.roleId ? { roleId: data.roleId } : {}),
        status,
        ...(waitingOn ? { waitingOn } : {}),
        ...(status === 'needs_decision' && decision?.side === 'company'
          ? { needsDecision: { side: 'company' as const, question: decision.question, options: decision.options } }
          : {}),
        ...(typeof data.documentVersion === 'number' ? { documentVersion: data.documentVersion } : {}),
        iApproved: typeof data.documentVersion === 'number' && (data as { approved?: Record<string, number> }).approved?.company === data.documentVersion,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  /** Candidate requests list (`candidateId == me` ordered by `updatedAt desc`). Never exposes `brief`, `companyId`, or company-side decision details. */
  async listCandidateRequests(caller: TalentCaller): Promise<CandidateRequestSummary[]> {
    const { id: personId } = callerOf(caller, 'Sign in as a person to view requests');
    const snap = await this.col.where('candidateId', '==', personId).orderBy('updatedAt', 'desc').limit(100).get();
    return snap.docs.map((doc) => {
      const data = doc.data() as StoredTalentRoom;
      const decision = normalizeDecision(data.needsDecision);
      const status = normalizeStatus(data.status);
      const waitingOn = status === 'needs_decision' ? decision?.side : undefined;
      return {
        id: doc.id,
        companyName: typeof data.companyName === 'string' ? data.companyName : '',
        candidateAlias: typeof data.candidateAlias === 'string' ? data.candidateAlias : '',
        status,
        ...(waitingOn ? { waitingOn } : {}),
        ...(status === 'needs_decision' && decision?.side === 'candidate'
          ? { needsDecision: { side: 'candidate' as const, question: decision.question, options: decision.options } }
          : {}),
        ...(typeof data.documentVersion === 'number' ? { documentVersion: data.documentVersion } : {}),
        iApproved: typeof data.documentVersion === 'number' && (data as { approved?: Record<string, number> }).approved?.candidate === data.documentVersion,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  /** Live room detail for either company or candidate, with side derived strictly from Firestore `companyId`/`candidateId`. */
  async getRoomView(caller: TalentCaller, roomId: string): Promise<TalentRoomDetail> {
    const { id, viewerSide, record } = await this.loadForViewer(caller, roomId);
    const otherSide: RoomSideKind = viewerSide === 'company' ? 'candidate' : 'company';
    try {
      const room = await this.parlyClient.getRoom(id);
      const mySideRef = resolveParlySideRef(viewerSide, room, record);
      const otherSideRef = resolveParlySideRef(otherSide, room, record);
      const { messages } = await this.parlyClient.messages(id, mySideRef);

      const status = normalizeStatus(room.status ?? record.status);
      const storedDecision = normalizeDecision(record.needsDecision);
      const livePending = room.pending?.[0];
      const liveDecisionSide = livePending ? sideKindOfRef(livePending.sideRef, room, record) : undefined;
      const activeDecision: TalentRoomDecision | undefined = livePending && liveDecisionSide
        ? {
            side: liveDecisionSide,
            question: livePending.question,
            options: Array.isArray(livePending.options) ? livePending.options : [],
          }
        : status === 'needs_decision'
          ? storedDecision
          : undefined;

      const waitingOn = activeDecision?.side;
      const myDecision = activeDecision?.side === viewerSide ? activeDecision : undefined;

      let document: TalentRoomDocumentView | undefined;
      if (room.document) {
        const approvals = room.document.approvals ?? {};
        const myApp = approvals[mySideRef] ?? approvals[viewerSide];
        const otherApp = approvals[otherSideRef] ?? approvals[otherSide];
        const v = room.document.version;
        document = {
          version: v,
          text: room.document.text,
          myApproved: Boolean(myApp && myApp.version === v),
          otherApproved: Boolean(otherApp && otherApp.version === v),
          ...(myApp && myApp.version === v ? { myApprovedAt: myApp.at } : {}),
          ...(otherApp && otherApp.version === v ? { otherApprovedAt: otherApp.at } : {}),
        };
      }

      const revealedContact = status === 'agreed'
        ? await this.resolveRevealedContact(otherSide, record)
        : undefined;

      return {
        id,
        viewerSide,
        companyName: typeof record.companyName === 'string' ? record.companyName : '',
        candidateAlias: typeof record.candidateAlias === 'string' ? record.candidateAlias : '',
        ...(viewerSide === 'company' ? { brief: normalizeBrief(record.brief) } : {}),
        goal: typeof room.goal === 'string' ? room.goal : '',
        status,
        ...(waitingOn ? { waitingOn } : {}),
        ...(myDecision ? { needsDecision: myDecision } : {}),
        ...(document ? { document } : {}),
        ...(revealedContact ? { revealedContact } : {}),
        messages: Array.isArray(messages) ? messages : [],
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      };
    } catch (err) {
      rethrowParlyError(err);
    }
  }

  /** Answers a pending decision for the viewer's derived side (`company` or `candidate`). Never trusts a client-supplied side. */
  async decide(caller: TalentCaller, roomId: string, rawChoice: unknown): Promise<{ ok: true }> {
    const { id, viewerSide, record } = await this.loadForViewer(caller, roomId);
    const choice = text(rawChoice, 2000, 'choice');
    if (!choice) throw new TalentError('invalid', 'Choose or enter an answer');
    const storedDecision = normalizeDecision(record.needsDecision);
    if (storedDecision && storedDecision.side !== viewerSide) {
      throw new TalentError('conflict', 'No decision is waiting on your side');
    }
    try {
      await this.parlyClient.decide(id, viewerSide, choice);
    } catch (err) {
      rethrowParlyError(err);
    }
    if (storedDecision?.side === viewerSide || record.status === 'needs_decision') {
      await this.col.doc(id).set(
        {
          status: 'talking',
          needsDecision: FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
    return { ok: true };
  }

  /** Approves the current document version for the viewer's derived side (`company` or `candidate`). Never trusts a client-supplied side. */
  async approve(caller: TalentCaller, roomId: string, rawVersion: unknown): Promise<{ ok: true; agreed: boolean }> {
    const { id, viewerSide } = await this.loadForViewer(caller, roomId);
    if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
      throw new TalentError('invalid', 'version must be a positive integer');
    }
    try {
      const res = await this.parlyClient.approve(id, viewerSide, rawVersion);
      await this.col.doc(id).set(
        {
          ...(res.agreed ? { status: 'agreed', needsDecision: FieldValue.delete() } : {}),
          documentVersion: rawVersion,
          // Which summary version each side approved, so lists can say "Waiting for them".
          approved: { [viewerSide]: rawVersion },
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { ok: true, agreed: Boolean(res.agreed) };
    } catch (err) {
      rethrowParlyError(err);
    }
  }

  /** Either side passes: the room ends for both (no contact details are shared). */
  async pass(caller: TalentCaller, roomId: string): Promise<{ ok: true }> {
    const { id } = await this.loadForViewer(caller, roomId);
    if (!this.parlyClient.close) throw new TalentError('unavailable', 'Ending a conversation is not available');
    try {
      await this.parlyClient.close(id);
      await this.col.doc(id).set({ status: 'closed', needsDecision: FieldValue.delete(), updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true };
    } catch (err) {
      rethrowParlyError(err);
    }
  }
}

let cachedRoomViews: TalentRoomViews | undefined;

export function roomViews(): TalentRoomViews {
  return (cachedRoomViews ??= new TalentRoomViews());
}
