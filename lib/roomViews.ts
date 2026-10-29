import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { db } from './db.ts';
import { parly, ParlyError, type Room, type RoomMessage, type RoomStatus, type SideInput } from './parly.ts';
import { callerOf, domainBlocked, TalentError, text, verifiedDomains, type TalentCaller, type TalentProfile } from './profiles.ts';

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
  status: RoomStatus;
  waitingOn?: RoomSideKind;
  needsDecision?: { side: 'company'; question: string; options: string[] };
  documentVersion?: number;
  createdAt: string;
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
  openRoom?: (body: { goal: string; sides: [SideInput, SideInput]; metadata?: Record<string, string> }) => Promise<{ id: string; status: RoomStatus }>;
  getRoom: (roomId: string) => Promise<Room>;
  messages: (roomId: string, side: string, after?: string) => Promise<{ messages: RoomMessage[] }>;
  decide: (roomId: string, decisionId: string, choice: string) => Promise<{ ok: true }>;
  approve: (roomId: string, side: string, version: number) => Promise<{ ok: true; agreed: boolean }>;
}

const HIRING_AGENT_KEY = 'hiring-rep';
const CANDIDATE_AGENT_KEY = 'candidate-rep';
const HIRING_AGENT_INSTRUCTIONS =
  'You represent the hiring company in an anonymous Parly Talent room. Evaluate mutual role, technical, compensation, and working-mode fit against your private brief without asking for or revealing personal identifiers. Use ASK MY SIDE when you need a decision from the hiring team, and draft/update the shared fit summary once fit is clear.';
const CANDIDATE_AGENT_INSTRUCTIONS =
  'You represent the candidate in an anonymous Parly Talent room. Protect candidate anonymity strictly: never reveal names, employers, URLs, or raw private text. Evaluate mutual fit against your private brief, use ASK MY SIDE when a decision is needed from the candidate, and draft/update the shared fit summary once fit is clear.';

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
   * A: Opens a room from a candidate search result with a private company brief (`role`, `comp`, `mustHaves`).
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
    const candidateDoc = candidateSnap.docs.find((d) => (d.data() as TalentProfile).searchable === true);
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

    const candidateBriefText = [
      candidateProfile.publicSummary,
      candidateProfile.openTo ? `Open to: ${candidateProfile.openTo}` : '',
      candidateProfile.preferences
        ? `Private candidate preferences (never quote raw text; use to evaluate fit and decide): ${candidateProfile.preferences}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const goal = `Evaluate fit: ${companyName} (${role}) × ${candidateProfile.alias}`.slice(0, 200);
    const sides: [SideInput, SideInput] = [
      { ref: 'company', name: companyName.slice(0, 60), brief: companyBriefText.slice(0, 4000), agent: HIRING_AGENT_KEY },
      { ref: 'candidate', name: candidateProfile.alias.slice(0, 60), brief: candidateBriefText.slice(0, 4000), agent: CANDIDATE_AGENT_KEY },
    ];

    try {
      await this.ensureAgentTemplates();
      let opened: { id: string; status: RoomStatus };
      try {
        opened = await this.parlyClient.openRoom({ goal, sides });
      } catch (err) {
        if (err instanceof ParlyError && err.status === 400 && /No agent/i.test(err.message) && this.parlyClient.createAgent) {
          this.agentsEnsured = false;
          await this.ensureAgentTemplates();
          opened = await this.parlyClient.openRoom({ goal, sides });
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
   * B: Processes a signed Parly room webhook (`needs_decision`, `document_updated`, `agreed`, `stuck`, `closed`).
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

  /** C: Company rooms list (`companyId == me` ordered by `updatedAt desc`). Never exposes `candidateId` or candidate-side decision details. */
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
        status,
        ...(waitingOn ? { waitingOn } : {}),
        ...(status === 'needs_decision' && decision?.side === 'company'
          ? { needsDecision: { side: 'company' as const, question: decision.question, options: decision.options } }
          : {}),
        ...(typeof data.documentVersion === 'number' ? { documentVersion: data.documentVersion } : {}),
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  /** D: Candidate requests list (`candidateId == me` ordered by `updatedAt desc`). Never exposes `brief`, `companyId`, or company-side decision details. */
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
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { ok: true, agreed: Boolean(res.agreed) };
    } catch (err) {
      rethrowParlyError(err);
    }
  }
}

let cachedRoomViews: TalentRoomViews | undefined;

export function roomViews(): TalentRoomViews {
  return (cachedRoomViews ??= new TalentRoomViews());
}

