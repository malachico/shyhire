// Server code only. Direct "Sign In with LinkedIn using OpenID Connect" connection; the access token is used once to read OIDC userinfo and never stored.
import { appUrl } from './github.ts';
import { TalentError } from './profiles.ts';
import type { Verification } from './types.ts';

export const LINKEDIN_FLOW_COOKIE = 'talent_linkedin';
export const LINKEDIN_CALLBACK_PATH = '/talent/auth/linkedin/callback';
export const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
export const LINKEDIN_SCOPES = 'openid profile email';

export interface LinkedInIdentity {
  sub: string;
  name?: string;
  email?: string;
  verification: Verification;
}

export interface TalentLinkedInOptions {
  clientId: string;
  clientSecret: string;
  webUrl: string;
}

/**
 * Direct LinkedIn OpenID Connect 3-legged OAuth client.
 * Note: LinkedIn's standard `/oauth/v2/authorization` and `/oauth/v2/accessToken` confidential-client
 * endpoints authenticate with `client_secret` + `state` (passing `code_verifier` to `/oauth/v2/accessToken`
 * is rejected by LinkedIn unless native-pkce is enabled on a separate endpoint).
 */
export class TalentLinkedIn {
  readonly options: TalentLinkedInOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TalentLinkedInOptions, fetchImpl: typeof fetch = fetch) {
    this.options = options;
    this.fetchImpl = fetchImpl;
  }

  authorizeUrl(state: string): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.options.clientId,
      redirect_uri: `${this.options.webUrl.replace(/\/+$/, '')}${LINKEDIN_CALLBACK_PATH}`,
      state,
      scope: LINKEDIN_SCOPES,
    });
    return `${LINKEDIN_AUTHORIZE_URL}?${query}`;
  }

  async exchange(code: unknown): Promise<LinkedInIdentity> {
    if (typeof code !== 'string' || !code || code.length > 2000) {
      throw new TalentError('invalid', 'Invalid LinkedIn authorization');
    }
    const redirectUri = `${this.options.webUrl.replace(/\/+$/, '')}${LINKEDIN_CALLBACK_PATH}`;
    const tokenRes = await this.fetchImpl(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    const auth = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !auth.access_token || auth.error) {
      throw new TalentError('unauthorized', 'LinkedIn connection failed. Start again.');
    }
    const userRes = await this.fetchImpl(LINKEDIN_USERINFO_URL, {
      headers: { authorization: `Bearer ${auth.access_token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!userRes.ok) {
      throw new TalentError('unavailable', 'LinkedIn could not verify your account. Try again.');
    }
    const user = (await userRes.json().catch(() => ({}))) as {
      sub?: unknown;
      name?: unknown;
      given_name?: unknown;
      family_name?: unknown;
      email?: unknown;
      email_verified?: unknown;
    };
    const sub = typeof user.sub === 'string' ? user.sub.trim() : '';
    if (!sub || !/^[A-Za-z0-9._-]{1,255}$/.test(sub)) {
      throw new TalentError('unauthorized', 'LinkedIn returned an invalid identity');
    }
    const rawName =
      typeof user.name === 'string' && user.name.trim()
        ? user.name.trim()
        : [user.given_name, user.family_name]
            .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
            .map((part) => part.trim())
            .join(' ');
    const name = rawName ? rawName.slice(0, 120) : undefined;
    const rawEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const email =
      rawEmail && rawEmail.includes('@') && user.email_verified === true
        ? rawEmail.slice(0, 254)
        : undefined;
    const data: Record<string, string> = {};
    if (name) data.name = name;
    if (email) data.email = email;
    return {
      sub,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      verification: {
        id: 'linkedin',
        source: 'linkedin',
        label: 'LinkedIn account',
        verifiedAt: new Date().toISOString(),
        subject: sub,
        data,
      },
    };
  }
}

export function linkedinClientId(): string | undefined {
  return process.env.TALENT_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || undefined;
}

export function linkedinClientSecret(): string | undefined {
  return process.env.TALENT_LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_CLIENT_SECRET || undefined;
}

export function linkedinConfigured(): boolean {
  return Boolean(linkedinClientId() && linkedinClientSecret() && process.env.APP_URL);
}

export function linkedinClient(): TalentLinkedIn {
  return new TalentLinkedIn({
    clientId: linkedinClientId()!,
    clientSecret: linkedinClientSecret()!,
    webUrl: appUrl(),
  });
}

export async function linkedinAccount(code: string): Promise<LinkedInIdentity> {
  return linkedinClient().exchange(code);
}

