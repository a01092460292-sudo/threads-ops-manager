const crypto = require('crypto');

const required = ['META_THREADS_APP_ID', 'META_THREADS_APP_SECRET', 'THREADS_COOKIE_SECRET'];

function config(req) {
  const missing = required.filter((key) => !process.env[key]);
  const origin = process.env.APP_ORIGIN || `https://${req.headers.host}`;
  return {
    ready: missing.length === 0,
    missing,
    appId: process.env.META_THREADS_APP_ID,
    appSecret: process.env.META_THREADS_APP_SECRET,
    cookieSecret: process.env.THREADS_COOKIE_SECRET,
    redirectUri: process.env.META_THREADS_REDIRECT_URI || `${origin}/api/threads/callback`,
    appOrigin: origin,
  };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

function cookieName(clientId) {
  const suffix = crypto.createHash('sha256').update(String(clientId || '')).digest('hex').slice(0, 18);
  return `threads_session_${suffix}`;
}

function oauthCookieName(clientId) {
  const suffix = crypto.createHash('sha256').update(String(clientId || '')).digest('hex').slice(0, 18);
  return `threads_oauth_${suffix}`;
}

function seal(value, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function unseal(value, secret) {
  try {
    const raw = Buffer.from(value, 'base64url');
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

function session(req, clientId, cfg) {
  const value = parseCookies(req)[cookieName(clientId)];
  return value && cfg.cookieSecret ? unseal(value, cfg.cookieSecret) : null;
}

function setCookie(res, name, value, maxAge) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0);
}

function encodeState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeState(value, secret) {
  try {
    const [body, signature] = String(value).split('.');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.issuedAt || Date.now() - payload.issuedAt > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function graph(path, token) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://graph.threads.net/v1.0/${path}${separator}access_token=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Threads API 요청에 실패했습니다.');
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

module.exports = {
  config, json, parseCookies, cookieName, oauthCookieName, seal, unseal,
  session, setCookie, clearCookie, encodeState, decodeState, graph,
};
