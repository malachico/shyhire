// Server code only. Google OAuth 2.0 + PKCE sign-in; the access token is used once to read OpenID userinfo and never stored.
import { createHash } from 'node:crypto';
import { appUrl } from './github.ts';
import { TalentError } from './profiles.ts';

export const GOOGLE_FLOW_COOKIE = 'talent_google';
export const GOOGLE_CALLBACK_PATH = '/talent/auth/google/callback';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

export interface TalentGoogleOptions {
  clientId: string;
  clientSecret: string;
  webUrl: string;
}

export class TalentGoogle {
  readonly options: TalentGoogleOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TalentGoogleOptions, fetchImpl: typeof fetch = fetch) {
    this.options = options;
    this.fetchImpl = fetchImpl;
  }

  authorizeUrl(state: string, verifier: string): string {
    const query = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: `${this.options.webUrl.replace(/\/+$/, '')}${GOOGLE_CALLBACK_PATH}`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }

  async exchange(code: unknown, verifier: unknown): Promise<GoogleIdentity> {
    if (
      typeof code !== 'string' ||
      !code ||
      code.length > 500 ||
      typeof verifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)
    ) {
      throw new TalentError('invalid', 'Invalid Google authorization');
    }
    const tokenRes = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: `${this.options.webUrl.replace(/\/+$/, '')}${GOOGLE_CALLBACK_PATH}`,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    const auth = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !auth.access_token || auth.error) {
      throw new TalentError('unauthorized', 'Google sign-in failed. Start again.');
    }
    const userRes = await this.fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${auth.access_token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!userRes.ok) {
      throw new TalentError('unavailable', 'Google could not verify your account. Try again.');
    }
    const user = (await userRes.json().catch(() => ({}))) as {
      sub?: unknown;
      email?: unknown;
      email_verified?: unknown;
      name?: unknown;
    };
    const sub = typeof user.sub === 'string' ? user.sub.trim() : '';
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!sub || !/^[A-Za-z0-9._-]{1,255}$/.test(sub) || !email || !email.includes('@') || user.email_verified !== true) {
      throw new TalentError('unauthorized', 'Google returned an unverified or invalid identity');
    }
    const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0, 120) : undefined;
    return {
      sub,
      email,
      ...(name ? { name } : {}),
    };
  }
}

export function googleClientId(): string | undefined {
  return process.env.TALENT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || undefined;
}

export function googleClientSecret(): string | undefined {
  return process.env.TALENT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || undefined;
}

export function googleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret() && process.env.APP_URL);
}

export function googleClient(): TalentGoogle {
  return new TalentGoogle({
    clientId: googleClientId()!,
    clientSecret: googleClientSecret()!,
    webUrl: appUrl(),
  });
}

export async function googleAccount(code: string, verifier: string): Promise<GoogleIdentity> {
  return googleClient().exchange(code, verifier);
}
