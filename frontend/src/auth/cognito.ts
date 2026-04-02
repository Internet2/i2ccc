import { authConfig } from './config';

// --- Types ---

export interface TokenSet {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface CognitoUser {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  exp: number;
}

// --- Auth Flows ---

export function redirectToLogin(): void {
  const params = new URLSearchParams({
    identity_provider: 'Internet2SSO',
    client_id: authConfig.clientId,
    response_type: 'code',
    scope: authConfig.scopes,
    redirect_uri: authConfig.redirectUri,
  });

  window.location.assign(`${authConfig.domain}/oauth2/authorize?${params.toString()}`);
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: authConfig.clientId,
    code,
    redirect_uri: authConfig.redirectUri,
  });

  const response = await fetch(`${authConfig.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: authConfig.clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${authConfig.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

export function logoutRedirect(): void {
  sessionStorage.removeItem('cognito_id_token');
  sessionStorage.removeItem('cognito_access_token');

  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    logout_uri: authConfig.logoutUri,
  });

  window.location.assign(`${authConfig.domain}/logout?${params.toString()}`);
}

// --- Token Utilities ---

export function parseIdToken(idToken: string): CognitoUser {
  const payload = idToken.split('.')[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const parsed = JSON.parse(decoded);

  return {
    sub: parsed.sub,
    email: parsed.email,
    given_name: parsed.given_name,
    family_name: parsed.family_name,
    exp: parsed.exp,
  };
}

export function isTokenExpired(idToken: string, bufferSeconds = 60): boolean {
  const { exp } = parseIdToken(idToken);
  return exp - bufferSeconds < Date.now() / 1000;
}
