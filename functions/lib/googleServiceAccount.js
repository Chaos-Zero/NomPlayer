// Mints a Google OAuth access token for a service account entirely with the
// runtime's built-in Web Crypto API, no googleapis SDK (it depends on Node
// APIs Cloudflare Workers don't have), no extra dependency at all.
//
// This is the JWT-bearer flow (RFC 7523): sign a short-lived claim asserting
// "I am this service account, requesting this scope" with the service
// account's RSA private key, then trade that signed JWT for a real access
// token at Google's token endpoint. The private key never leaves this
// function, it's read once from a Cloudflare Secret per request and never
// logged, returned, or cached across requests.
//
// Setup: create the service account + key in Google Cloud Console, then share
// the target spreadsheet with its email as an Editor, see README for the
// full walkthrough. No OAuth consent screen, no per-user authorization, and
// nobody besides this service account (i.e. nobody without the key) can ever
// use this credential.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlFromString(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts either a real multi-line PEM (Cloudflare Secrets support that
 * directly) or one with literal "\n" escape sequences (common if the key was
 * pasted from a single-line JSON export), normalizes to the latter either way. */
async function importPrivateKey(pem) {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const pemBody = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), (char) =>
    char.charCodeAt(0),
  );

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signJwt(serviceAccountEmail, privateKeyPem) {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccountEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlFromBytes(signature)}`;
}

/** Returns a fresh Sheets-scoped access token, good for ~1 hour. Mints a new
 * one every call, a single sync run is well within Google's rate limits for
 * this, and there's no safe place to cache it between requests here anyway. */
export async function getServiceAccountAccessToken(
  serviceAccountEmail,
  privateKeyPem,
) {
  if (!serviceAccountEmail || !privateKeyPem) {
    throw new Error('Google Sheets sync is not configured on this deployment.');
  }

  const assertion = await signJwt(serviceAccountEmail, privateKeyPem);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body?.error_description ||
        body?.error ||
        `Google token request failed (${response.status})`,
    );
  }

  const data = await response.json();
  return data.access_token;
}
