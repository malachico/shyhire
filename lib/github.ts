// Server code only. GitHub sign-in and public activity extraction: OAuth with state + PKCE; the token is used once and never kept.
import { TalentError } from './profiles.ts';
import type { Verification } from './types.ts';

export const GITHUB_FLOW_COOKIE = 'talent_github';
export const CALLBACK_PATH = '/talent/auth/github/callback';

export interface GitHubIdentity {
  id: number;
  login: string;
  verification: Verification;
}

export interface TalentGitHubOptions {
  clientId: string;
  clientSecret: string;
  webUrl: string;
}

/** This query requests only public repositories/PR counts and the opaque restricted-contribution count. */
export const githubProfileQuery = `query($prs: String!) {
  viewer {
    repositories(first: 50, privacy: PUBLIC, ownerAffiliations: OWNER, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount nodes { languages(first: 10) { nodes { name } } }
    }
    contributionsCollection { restrictedContributionsCount }
  }
  search(query: $prs, type: ISSUE, first: 1) { issueCount }
}`;

export class TalentGitHub {
  readonly options: TalentGitHubOptions;
  private readonly fetchImpl: typeof fetch;
  constructor(options: TalentGitHubOptions, fetchImpl: typeof fetch = fetch) {
    this.options = options;
    this.fetchImpl = fetchImpl;
  }
  async exchange(code: unknown, verifier: unknown): Promise<GitHubIdentity> {
    if (typeof code !== 'string' || !code || code.length > 500 || typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
      throw new TalentError('invalid', 'Invalid GitHub authorization');
    }
    const response = await this.fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: `${this.options.webUrl.replace(/\/+$/, '')}${CALLBACK_PATH}`,
      }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    const auth = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!response.ok || !auth.access_token || auth.error) throw new TalentError('unauthorized', 'GitHub sign-in failed. Start again.');
    const headers = { authorization: `Bearer ${auth.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'parly-talent' };
    const get = async (url: string, init?: RequestInit): Promise<Record<string, any>> => {
      const res = await this.fetchImpl(url, { ...init, headers: { ...headers, ...init?.headers }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!res.ok) throw new TalentError('unavailable', 'GitHub could not verify your profile. Try again.');
      return res.json() as Promise<Record<string, any>>;
    };
    const user = await get('https://api.github.com/user');
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== 'string' || !/^[a-z0-9-]{1,39}$/i.test(user.login)) {
      throw new TalentError('unauthorized', 'GitHub returned an invalid identity');
    }
    const result = await get('https://api.github.com/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: githubProfileQuery, variables: { prs: `author:${user.login} is:pr is:merged is:public` } }),
      headers: { 'content-type': 'application/json' },
    });
    if (result.errors || !result.data?.viewer) throw new TalentError('unavailable', 'GitHub profile extraction failed. Please try again.');
    const viewer = result.data.viewer;
    const count = (v: unknown) => {
      if (!Number.isSafeInteger(v) || Number(v) < 0) throw new TalentError('unavailable', 'Invalid GitHub counts');
      return Number(v);
    };
    const repos = viewer.repositories;
    if (!Array.isArray(repos?.nodes) || repos.nodes.length > 50) throw new TalentError('unavailable', 'Invalid public GitHub repositories');
    const languages = [...new Set<string>(repos.nodes.flatMap((r: any) => (r.languages?.nodes ?? []).map((l: any) => String(l.name).slice(0, 100))))].slice(0, 100);
    return {
      id: user.id,
      login: user.login,
      verification: {
        id: 'github',
        source: 'github',
        label: 'GitHub activity',
        verifiedAt: new Date().toISOString(),
        data: {
          languages,
          publicRepositories: count(repos.totalCount),
          mergedPublicPullRequests: count(result.data.search?.issueCount),
          restrictedContributionsCount: count(viewer.contributionsCollection?.restrictedContributionsCount),
        },
      },
    };
  }
}

export function appUrl(): string {
  const url = process.env.APP_URL?.replace(/\/+$/, '');
  if (!url) throw new Error('APP_URL must be set');
  return url;
}

export function githubConfigured(): boolean {
  return Boolean(process.env.TALENT_GITHUB_CLIENT_ID && process.env.TALENT_GITHUB_CLIENT_SECRET && process.env.APP_URL);
}

/** Trades the one-time code for the GitHub account and its public activity verification. */
export async function githubAccount(code: string, verifier: string): Promise<GitHubIdentity> {
  const gh = new TalentGitHub({
    clientId: process.env.TALENT_GITHUB_CLIENT_ID!,
    clientSecret: process.env.TALENT_GITHUB_CLIENT_SECRET!,
    webUrl: appUrl(),
  });
  return gh.exchange(code, verifier);
}

