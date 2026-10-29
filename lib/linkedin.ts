import { createHmac } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { callerOf, TalentError, type Profiles } from './profiles.ts';
import type { TalentCaller } from './types.ts';

export interface ToolAccount {
  authConfigId?: string;
  id: string;
  toolkit: string;
  status: string;
}

const API = () => process.env.COMPOSIO_API_URL || 'https://backend.composio.dev/api/v3.1';

/** Minimal Composio client for Talent's dedicated LinkedIn OAuth connection. */
export class Composio {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API()}${path}`, {
      method,
      headers: { 'x-api-key': this.apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) throw new TalentError('unavailable', `Composio answered HTTP ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Talent supplies its dedicated least-privilege config, never the generic toolkit fallback. */
  async connectWithConfig(userId: string, authConfigId: string, callbackUrl: string): Promise<string> {
    const link = await this.call<{ redirect_url: string }>('POST', '/connected_accounts/link', {
      auth_config_id: authConfigId,
      user_id: userId,
      callback_url: callbackUrl,
    });
    return link.redirect_url;
  }

  async accounts(userId: string): Promise<ToolAccount[]> {
    const list = await this.call<{ items: { id: string; status: string; toolkit: { slug: string }; auth_config?: { id: string } }[] }>(
      'GET',
      `/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=200`,
    );
    return list.items.map((a) => ({
      id: a.id,
      toolkit: a.toolkit.slug,
      status: a.status,
      ...(a.auth_config?.id ? { authConfigId: a.auth_config.id } : {}),
    }));
  }

  async execute(userId: string, slug: string, args: Record<string, unknown>, accountId?: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    try {
      const r = await this.call<{ successful: boolean; data?: unknown; error?: string | null }>(
        'POST',
        `/tools/execute/${encodeURIComponent(slug)}`,
        { user_id: userId, arguments: args, ...(accountId ? { connected_account_id: accountId } : {}) },
      );
      return r.successful ? { ok: true, data: r.data } : { ok: false, error: r.error ?? 'failed' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** OAuth account control, not a verification of a person's employment claims. */
export class TalentLinkedIn {
  private readonly db: Firestore;
  private readonly profiles: Profiles;
  private readonly composio: Pick<Composio, 'accounts' | 'execute' | 'connectWithConfig'>;
  private readonly key: Buffer;
  private readonly authConfigId: string;
  private readonly base: string;

  constructor(
    db: Firestore,
    profiles: Profiles,
    composio: Pick<Composio, 'accounts' | 'execute' | 'connectWithConfig'>,
    key: Buffer,
    authConfigId: string,
    base: string,
  ) {
    this.db = db;
    this.profiles = profiles;
    this.composio = composio;
    this.key = key;
    this.authConfigId = authConfigId;
    this.base = base;
  }

  async connect(caller: TalentCaller, state: unknown): Promise<{ url: string }> {
    const { id } = callerOf(caller, 'People connect their LinkedIn accounts');
    if (typeof state !== 'string' || !/^[a-f0-9]{48}$/.test(state)) throw new TalentError('invalid', 'Invalid connection state');
    const callback = new URL('/talent/auth/linkedin/callback', this.base);
    callback.searchParams.set('state', state);
    return { url: await this.composio.connectWithConfig(id, this.authConfigId, callback.toString()) };
  }

  async verify(caller: TalentCaller): Promise<{ verified: true }> {
    const { id } = callerOf(caller, 'People connect their LinkedIn accounts');
    const accounts = await this.composio.accounts(id);
    const account = accounts.find((a) => a.toolkit === 'linkedin' && a.status === 'ACTIVE' && a.authConfigId === this.authConfigId);
    if (!account) throw new TalentError('invalid', 'Connect your LinkedIn account first');
    const result = await this.composio.execute(id, 'LINKEDIN_GET_MY_INFO', {}, account.id);
    const data = (result.data as { response_dict?: { sub?: unknown } } | undefined)?.response_dict;
    if (!result.ok || typeof data?.sub !== 'string' || !data.sub || data.sub.length > 500) {
      throw new TalentError('unavailable', 'LinkedIn could not confirm this connection. Try reconnecting.');
    }
    const subject = createHmac('sha256', this.key).update(`talent:linkedin:${data.sub}`).digest('hex');
    const ref = this.db.collection('talent_linkedin_identities').doc(subject);
    await this.db.runTransaction(async (tx) => {
      const owner = (await tx.get(ref)).data()?.personId;
      if (owner && owner !== id) throw new TalentError('conflict', 'This LinkedIn account is already connected to another profile');
      await this.profiles.verify(id, { id: 'linkedin', source: 'linkedin', label: 'LinkedIn account connected', verifiedAt: new Date().toISOString(), data: {} }, tx);
      tx.set(ref, { personId: id });
    });
    return { verified: true };
  }
}
