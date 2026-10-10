import { ADMIN_HTML } from './admin-ui.js';

const MAX_BODY = 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_REQUESTS = 12;
const failures = new Map();
const chatUsage = new Map();
const encoder = new TextEncoder();
const secretsReady = env => encoder.encode(env.LICENSE_SIGNING_SECRET || '').length >= 32 && (env.ADMIN_PASSWORD || '').length >= 16 && Boolean(env.OPENROUTER_API_KEY) && typeof env.ADMIN_PATH === 'string' && env.ADMIN_PATH.startsWith('/') && env.ADMIN_PATH.length >= 32 && !/[?#]/.test(env.ADMIN_PATH);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function equalConstantTime(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
async function issueLicense(secret, days) {
  const now = Date.now();
  const payload = {
    v: 1,
    id: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    iat: now,
    exp: now + days * 24 * 60 * 60 * 1000
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return { licenseKey: `RZAI1.${body}.${sig}`, expiresAt: payload.exp, days };
}
async function verifyLicense(value, secret) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const parts = value.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'RZAI1') return null;
  const [, body, provided] = parts;
  if (!body || !provided || !equalConstantTime(provided, await hmac(secret, body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    const now = Date.now();
    if (payload?.v !== 1 || typeof payload.id !== 'string' || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return null;
    if (payload.iat > now + 60_000 || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > 3650 * 24 * 60 * 60 * 1000 + 1000) return null;
    return payload;
  } catch { return null; }
}
async function readJson(request) {
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw new Error('Permintaan terlalu besar (maksimum 1 MB).');
  const text = await request.text();
  if (encoder.encode(text).byteLength > MAX_BODY) throw new Error('Permintaan terlalu besar (maksimum 1 MB).');
  return JSON.parse(text || '{}');
}
function ip(request) { return request.headers.get('CF-Connecting-IP') || 'unknown'; }
function blockRemaining(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.started >= LOGIN_WINDOW_MS) { failures.delete(key); return 0; }
  return entry.count >= MAX_FAILURES ? Math.ceil((LOGIN_WINDOW_MS - (Date.now() - entry.started)) / 1000) : 0;
}
function registerFailure(key) {
  let entry = failures.get(key);
  if (!entry || Date.now() - entry.started >= LOGIN_WINDOW_MS) entry = { count: 0, started: Date.now() };
  entry.count += 1;
  failures.set(key, entry);
}
function chatRateLimited(id) {
  const now = Date.now();
  const entry = chatUsage.get(id);
  if (!entry || now - entry.started >= CHAT_WINDOW_MS) {
    chatUsage.set(id, { started: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > CHAT_MAX_REQUESTS;
}
function serveAdmin() {
  return new Response(ADMIN_HTML, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET') return json({ ok: true });
    if (url.pathname === '/api/status' && request.method === 'GET') {
      const ready = secretsReady(env);
      return json({ ready, provider: 'OpenRouter', model: env.AI_MODEL || 'openrouter/auto', licensing: true });
    }

    if (url.pathname === '/api/license/verify' && request.method === 'POST') {
      if (!secretsReady(env)) return json({ error: 'Layanan key belum dikonfigurasi atau secret belum cukup kuat.' }, 503);
      const address = `verify:${ip(request)}`;
      const wait = blockRemaining(address);
      if (wait) return json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429, { 'Retry-After': String(wait) });
      try {
        const body = await readJson(request);
        const payload = await verifyLicense(String(body.licenseKey || ''), env.LICENSE_SIGNING_SECRET);
        if (!payload) {
          registerFailure(address);
          return json({ error: 'Key lisensi tidak valid atau sudah kedaluwarsa.' }, 401);
        }
        failures.delete(address);
        return json({ valid: true, expiresAt: payload.exp });
      } catch (error) { return json({ error: error.message || 'Permintaan key tidak valid.' }, 400); }
    }

    if (url.pathname === '/api/admin/issue' && request.method === 'POST') {
      if (!secretsReady(env)) return json({ error: 'Tiga secret Cloudflare belum dikonfigurasi atau secret admin/lisensi terlalu pendek.' }, 503);
      const address = `admin:${ip(request)}`;
      const wait = blockRemaining(address);
      if (wait) return json({ error: 'Terlalu banyak percobaan admin. Coba lagi nanti.' }, 429, { 'Retry-After': String(wait) });
      const authorization = request.headers.get('Authorization') || '';
      if (!equalConstantTime(authorization, `Bearer ${env.ADMIN_PASSWORD}`)) {
        registerFailure(address);
        return json({ error: 'Password admin tidak cocok.' }, 401);
      }
      try {
        const body = await readJson(request);
        const days = Number(body.days);
        if (!Number.isInteger(days) || days < 1 || days > 3650) return json({ error: 'Masa berlaku harus 1 sampai 3650 hari.' }, 400);
        failures.delete(address);
        return json(await issueLicense(env.LICENSE_SIGNING_SECRET, days));
      } catch (error) { return json({ error: error.message || 'Gagal menerbitkan key.' }, 400); }
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      if (!secretsReady(env)) return json({ error: 'Layanan lisensi atau OpenRouter belum dikonfigurasi.' }, 503);
      try {
        const body = await readJson(request);
        const license = await verifyLicense(String(body.licenseKey || ''), env.LICENSE_SIGNING_SECRET);
        if (!license) return json({ error: 'Key lisensi tidak valid atau sudah kedaluwarsa.' }, 401);
        if (chatRateLimited(license.id)) return json({ error: 'Batas sementara tercapai. Tunggu sebentar lalu coba lagi.' }, 429, { 'Retry-After': '60' });
        const messages = body.messages;
        if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) return json({ error: 'Riwayat chat tidak valid.' }, 400);
        const safeMessages = messages.map(m => ({ role: ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'user', content: String(m?.content ?? '').slice(0, 12000) }));
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': env.OPENROUTER_APP_TITLE || 'RuangAI', ...(env.SITE_URL ? { 'HTTP-Referer': env.SITE_URL } : {}) },
          body: JSON.stringify({ model: env.AI_MODEL || 'openrouter/auto', messages: safeMessages, temperature: 0.7, max_tokens: 2048 })
        });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) return json({ error: data?.error?.message || `OpenRouter mengembalikan HTTP ${upstream.status}.` }, upstream.status);
        return json({ reply: data?.choices?.[0]?.message?.content || 'Model tidak mengirim jawaban.' });
      } catch (error) { return json({ error: error.message || 'Terjadi kesalahan pada server.' }, 500); }
    }

    if (url.pathname === '/api/logout' && request.method === 'POST') return json({ ok: true });
    if (url.pathname.startsWith('/api/')) return json({ error: 'Endpoint tidak ditemukan.' }, 404);
    if (secretsReady(env) && url.pathname === env.ADMIN_PATH && request.method === 'GET') return serveAdmin();
    return env.ASSETS.fetch(request);
  }
};
