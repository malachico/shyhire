// Server code only. GitHub sign-in: OAuth with state + PKCE; the token is used once and never kept.

export const GITHUB_FLOW_COOKIE = 'talent_github';
export const CALLBACK_PATH = '/talent/auth/github/callback';

export function appUrl(): string {
  const url = process.env.APP_URL?.replace(/\/+$/, '');
  if (!url) throw new Error('APP_URL must be set');
  return url;
}

export function githubConfigured(): boolean {
  return Boolean(process.env.TALENT_GITHUB_CLIENT_ID && process.env.TALENT_GITHUB_CLIENT_SECRET && process.env.APP_URL);
}

/** Trades the one-time code for the GitHub account it belongs to. */
export async function githubAccount(code: string, verifier: string): Promise<{ id: number; login: string }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.TALENT_GITHUB_CLIENT_ID, client_secret: process.env.TALENT_GITHUB_CLIENT_SECRET,
      code, code_verifier: verifier, redirect_uri: `${appUrl()}${CALLBACK_PATH}`,
    }),
    cache: 'no-store',
  });
  const token = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!token.access_token) throw new Error('GitHub did not grant access');
  const user = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'parly-talent' }, cache: 'no-store' });
  const me = (await user.json().catch(() => ({}))) as { id?: unknown; login?: unknown };
  if (typeof me.id !== 'number' || typeof me.login !== 'string') throw new Error('GitHub did not return the account');
  return { id: me.id, login: me.login };
}
