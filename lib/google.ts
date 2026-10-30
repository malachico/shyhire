// Server code only. Sign in with Google using the client ID alone (OpenID Connect, id_token + form_post): Google
// posts a signed ID token back to the callback; we check Google's signature, our client ID as the audience, the
// one-time nonce, and a verified email. No client secret and no access token.
import { OAuth2Client } from 'google-auth-library';
import { appUrl } from './github.ts';
import { TalentError } from './profiles.ts';

export const GOOGLE_FLOW_COOKIE = 'talent_google';
export const GOOGLE_CALLBACK_PATH = '/talent/auth/google/callback';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

/** The ID token's claims once Google's signature and the audience are checked. */
export type IdTokenClaims = { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; nonce?: unknown };
export type VerifyIdToken = (idToken: string, audience: string) => Promise<IdTokenClaims | undefined>;

const googleVerify: VerifyIdToken = async (idToken, audience) => {
  const ticket = await new OAuth2Client(audience).verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};

export class TalentGoogle {
  readonly options: { clientId: string; webUrl: string };
  private readonly verify: VerifyIdToken;

  constructor(options: { clientId: string; webUrl: string }, verify: VerifyIdToken = googleVerify) {
    this.options = options;
    this.verify = verify;
  }

  authorizeUrl(state: string, nonce: string): string {
    const query = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: `${this.options.webUrl.replace(/\/+$/, '')}${GOOGLE_CALLBACK_PATH}`,
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }

  /** The person in a posted ID token, if Google signed it for us, for this sign-in (nonce), with a verified email. */
  async identity(idToken: unknown, nonce: unknown): Promise<GoogleIdentity> {
    if (typeof idToken !== 'string' || !idToken || idToken.length > 4096 || typeof nonce !== 'string' || nonce.length < 16) {
      throw new TalentError('invalid', 'Invalid Google sign-in');
    }
    let claims: IdTokenClaims | undefined;
    try {
      claims = await this.verify(idToken, this.options.clientId);
    } catch {
      throw new TalentError('unauthorized', 'Google sign-in failed. Start again.');
    }
    if (!claims || claims.nonce !== nonce) throw new TalentError('unauthorized', 'Google sign-in failed. Start again.');
    const sub = typeof claims.sub === 'string' ? claims.sub.trim() : '';
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!sub || !/^[A-Za-z0-9._-]{1,255}$/.test(sub) || !email || !email.includes('@') || claims.email_verified !== true) {
      throw new TalentError('unauthorized', 'Google returned an unverified or invalid identity');
    }
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 120) : undefined;
    return { sub, email, ...(name ? { name } : {}) };
  }
}

export function googleClientId(): string | undefined {
  return process.env.TALENT_GOOGLE_CLIENT_ID || undefined;
}

export function googleConfigured(): boolean {
  return Boolean(googleClientId() && process.env.APP_URL);
}

export function googleClient(): TalentGoogle {
  return new TalentGoogle({ clientId: googleClientId()!, webUrl: appUrl() });
}
