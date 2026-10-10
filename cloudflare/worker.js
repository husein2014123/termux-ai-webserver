const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const MAX_BODY = 1024 * 1024;
const loginFailures = new Map();
const enc = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}
function equalConstantTime(a, b) {
  const left = enc.encode(String(a)); const right = enc.encode(String(b));
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}
function base64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function signature(expiry, password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', key, enc.encode(String(expiry))));
}
async function cookieSession(request, password) {
  const item = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('ruangai_session='));
  if (!item) return false;
  const [expiryText, sig, extra] = item.slice('ruangai_session='.length).split('.');
  if (extra !== undefined || !/^\d+$/.test(expiryText || '')) return false;
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + SESSION_MS + 60_000) return false;
  return equalConstantTime(sig || '', await signature(expiry, password));
}
function ip(request) { return request.headers.get('CF-Connecting-IP') || 'unknown'; }
function retryAfter(ipAddress) {
  const entry = loginFailures.get(ipAddress);
  if (!entry || Date.now() - entry.started >= LOGIN_WINDOW_MS) { loginFailures.delete(ipAddress); return 0; }
  return entry.count >= LOGIN_MAX_FAILURES ? Math.ceil((LOGIN_WINDOW_MS - (Date.now() - entry.started)) / 1000) : 0;
}
async function readJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new Error('Pesan terlalu besar (maksimum 1 MB).');
  return await request.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const password = env.APP_PASSWORD || '';
    const authenticated = password ? await cookieSession(request, password) : false;

    if (url.pathname === '/healthz' && request.method === 'GET') return json({ ok: true });
    if (url.pathname === '/api/status' && request.method === 'GET') {
      const isOpenRouter = (env.AI_PROVIDER || (env.OPENROUTER_API_KEY ? 'openrouter' : 'openai')) === 'openrouter';
      return json({ ready: Boolean(isOpenRouter ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY), model: env.AI_MODEL || (isOpenRouter ? 'openrouter/auto' : 'gpt-4o-mini'), provider: env.AI_PROVIDER_NAME || (isOpenRouter ? 'OpenRouter' : 'OpenAI-compatible API'), loginRequired: true, authenticated, loginConfigured: Boolean(password) });
    }

    if (url.pathname === '/api/login' && request.method === 'POST') {
      if (!password) return json({ error: 'APP_PASSWORD belum diatur pada Cloudflare Worker.' }, 503);
      const address = ip(request);
      const wait = retryAfter(address);
      if (wait) return json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit.' }, 429, { 'Retry-After': String(wait) });
      try {
        const body = await readJson(request);
        if (!equalConstantTime(String(body.password || ''), password)) {
          let entry = loginFailures.get(address);
          if (!entry || Date.now() - entry.started >= LOGIN_WINDOW_MS) entry = { count: 0, started: Date.now() };
          entry.count += 1; loginFailures.set(address, entry);
          return json({ error: 'Kata sandi tidak cocok.' }, 401);
        }
        loginFailures.delete(address);
        const expiry = Date.now() + SESSION_MS;
        const sig = await signature(expiry, password);
        const cookie = `ruangai_session=${expiry}.${sig}; Max-Age=${SESSION_MS / 1000}; Path=/; HttpOnly; Secure; SameSite=Strict`;
        return json({ ok: true }, 200, { 'Set-Cookie': cookie });
      } catch (error) { return json({ error: error.message || 'Permintaan login tidak valid.' }, 400); }
    }

    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': 'ruangai_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict' });
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      if (!password) return json({ error: 'APP_PASSWORD belum diatur pada Cloudflare Worker.' }, 503);
      if (!authenticated) return json({ error: 'Silakan login kembali untuk melanjutkan.' }, 401);
      const isOpenRouter = (env.AI_PROVIDER || (env.OPENROUTER_API_KEY ? 'openrouter' : 'openai')) === 'openrouter';
      const apiKey = isOpenRouter ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
      if (!apiKey) return json({ error: isOpenRouter ? 'OPENROUTER_API_KEY belum diatur pada Cloudflare Worker.' : 'OPENAI_API_KEY belum diatur pada Cloudflare Worker.' }, 503);
      try {
        const body = await readJson(request);
        const messages = body.messages;
        if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) return json({ error: 'Riwayat chat tidak valid.' }, 400);
        const safeMessages = messages.map(m => ({ role: ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'user', content: String(m?.content ?? '').slice(0, 12000) }));
        const base = (env.AI_BASE_URL || (isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        if (isOpenRouter) {
          headers['X-OpenRouter-Title'] = env.OPENROUTER_APP_TITLE || 'RuangAI';
          if (env.SITE_URL) headers['HTTP-Referer'] = env.SITE_URL;
        }
        const upstream = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: env.AI_MODEL || (isOpenRouter ? 'openrouter/auto' : 'gpt-4o-mini'), messages: safeMessages, temperature: 0.7 }) });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) return json({ error: data?.error?.message || `API model mengembalikan HTTP ${upstream.status}.` }, upstream.status);
        return json({ reply: data?.choices?.[0]?.message?.content || 'Model tidak mengirim jawaban.' });
      } catch (error) { return json({ error: error.message || 'Terjadi kesalahan pada server.' }, 500); }
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Endpoint tidak ditemukan.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
