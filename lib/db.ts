import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient, GoogleAuth, type BaseExternalAccountClient } from 'google-auth-library';

export const DEFAULT_GCP_PROJECT_ID = 'parly-talent-0a7c87';

export function gcpExternalAccountClient(): BaseExternalAccountClient | undefined {
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID || 'vercel';
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || 'vercel';
  if (!projectNumber || !serviceAccountEmail) return undefined;
  return (
    ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      subject_token_supplier: {
        // Ignore ExternalAccountSupplierContext (which carries the IAM pool `audience`) so `@vercel/oidc` returns the raw Vercel OIDC token rather than exchanging it.
        getSubjectToken: () => getVercelOidcToken(),
      },
    }) ?? undefined
  );
}

const defaultGoogleAuth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });

/** Access token for GCP APIs (Vertex AI): uses Vercel OIDC Workload Identity Federation when configured, otherwise ADC. */
export async function gcpAccessToken(): Promise<string> {
  const external = gcpExternalAccountClient();
  if (external) {
    const { token } = await external.getAccessToken();
    if (!token) throw new Error('Could not obtain GCP access token via Workload Identity Federation');
    return token;
  }
  const token = await defaultGoogleAuth.getAccessToken();
  if (!token) throw new Error('Could not obtain GCP access token');
  return token;
}

/**
 * Creates a Firestore client for Talent's own GCP project (`parly-talent-0a7c87`).
 * - Locally and in tests: uses `FIRESTORE_EMULATOR_HOST` with no credentials.
 * - On Vercel production: uses Vercel OIDC + GCP Workload Identity Federation (`@vercel/oidc` + `ExternalAccountClient`).
 */
export function createFirestore(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.METADATA_SERVER_DETECTION ??= 'none';
    return new Firestore({
      projectId: process.env.GCP_PROJECT_ID || 'parly-talent-local',
      ignoreUndefinedProperties: true,
    });
  }
  const projectId = process.env.GCP_PROJECT_ID || DEFAULT_GCP_PROJECT_ID;
  const authClient = gcpExternalAccountClient();

  return new Firestore({
    projectId,
    ...(authClient ? { authClient } : {}),
    ignoreUndefinedProperties: true,
  });
}

let cachedDb: Firestore | undefined;

export function db(): Firestore {
  return (cachedDb ??= createFirestore());
}

/** A Firestore client on a throwaway emulator project, so test files never share data. */
export function testDb(): Firestore {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
  process.env.METADATA_SERVER_DETECTION ??= 'none';
  return new Firestore({ projectId: `test-${randomUUID().slice(0, 8)}`, ignoreUndefinedProperties: true });
}
