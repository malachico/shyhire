// Server code only: it holds the app's API key. The browser never calls Parly directly.

/** A side of a room, by Talent's own id for it (Parly never learns who it is). */
export interface SideInput { ref: string; name: string; brief: string; agent: string }
export type RoomStatus = 'talking' | 'needs_decision' | 'agreed' | 'stuck' | 'closed';
export interface Room {
  id: string;
  status: RoomStatus;
  goal: string;
  sides: { ref: string; name: string }[];
  /** approvals: by side ref, for the current version only. */
  document?: { version: number; text: string; approvals: Record<string, { version: number; at: string }> };
  /** At most one: the decision a side's agent asked its person for (decisionId is that side's ref). */
  pending: { decisionId: string; sideRef: string; question: string; options: string[] }[];
  metadata?: Record<string, string>;
}
export interface RoomMessage { id: string; channel: 'shared' | 'corner'; from: string; at: string; text: string; post?: string }

export class ParlyError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const base = () => (process.env.PARLY_API_URL ?? 'https://hub.parly.dev').replace(/\/+$/, '');

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.PARLY_API_KEY;
  if (!key) throw new ParlyError(500, 'PARLY_API_KEY is not set');
  const res = await fetch(`${base()}/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${key}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ParlyError(res.status, body.error ?? `Parly answered ${res.status}`);
  return body as T;
}

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)).toString();
  return s ? `?${s}` : '';
};
const id = encodeURIComponent;

export const parly = {
  /** Which app this key is. */
  me: () => call<{ id: string; workspaceId: string; name: string; scopes: string[]; agents: string[] }>('/me'),
  /** Saves an agent template (the same key updates it); every room side gets its own private copy. */
  createAgent: (key: string, name: string, instructions: string) => call<{ key: string; name: string }>('/agents', { method: 'POST', body: { key, name, instructions } }),
  openRoom: (body: { goal: string; sides: [SideInput, SideInput]; metadata?: Record<string, string> }) => call<{ id: string; status: RoomStatus }>('/rooms', { method: 'POST', body }),
  getRoom: (roomId: string) => call<Room>(`/rooms/${id(roomId)}`),
  listRooms: (metadata: Record<string, string> = {}) =>
    call<{ rooms: Room[] }>(`/rooms${q(Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata.${k}`, v])))}`),
  /** What one side may see: the shared conversation and its own corner. */
  messages: (roomId: string, side: string, after?: string) => call<{ messages: RoomMessage[] }>(`/rooms/${id(roomId)}/messages${q({ side, after })}`),
  decide: (roomId: string, decisionId: string, choice: string) => call<{ ok: true }>(`/rooms/${id(roomId)}/decisions/${id(decisionId)}`, { method: 'POST', body: { choice } }),
  approve: (roomId: string, side: string, version: number) => call<{ ok: true; agreed: boolean }>(`/rooms/${id(roomId)}/sides/${id(side)}/approve`, { method: 'POST', body: { version } }),
  close: (roomId: string) => call<{ ok: true }>(`/rooms/${id(roomId)}/close`, { method: 'POST' }),
};
