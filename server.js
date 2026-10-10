const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const APP_PASSWORD = process.env.APP_PASSWORD || '';
if (!APP_PASSWORD) {
  console.error('APP_PASSWORD wajib diatur sebelum server dijalankan.');
  process.exit(1);
}
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER = (process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'openai')).toLowerCase();
const IS_OPENROUTER = PROVIDER === 'openrouter';
const API_KEY = IS_OPENROUTER ? (process.env.OPENROUTER_API_KEY || '') : (process.env.OPENAI_API_KEY || '');
const API_BASE = (process.env.AI_BASE_URL || (IS_OPENROUTER ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || (IS_OPENROUTER ? 'openrouter/auto' : 'gpt-4o-mini');
const PROVIDER_NAME = process.env.AI_PROVIDER_NAME || (IS_OPENROUTER ? 'OpenRouter' : 'OpenAI-compatible API');
const MAX_BODY = 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map();
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) { reject(new Error('Pesan terlalu besar (maksimum 1 MB).')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Format permintaan tidak valid.')); }
    });
    req.on('error', reject);
  });
}
function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function makeSession(expiry) {
  const signature = crypto.createHmac('sha256', APP_PASSWORD).update(String(expiry)).digest('base64url');
  return `${expiry}.${signature}`;
}
function hasValidSession(req) {
  const cookies = (req.headers.cookie || '').split(';').map(part => part.trim());
  const raw = cookies.find(part => part.startsWith('ruangai_session='))?.slice('ruangai_session='.length);
  if (!raw) return false;
  const [expiryText, signature, extra] = raw.split('.');
  if (extra !== undefined || !/^\d+$/.test(expiryText || '')) return false;
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + SESSION_MS + 60_000) return false;
  return constantTimeEqual(raw, makeSession(expiry));
}
function cookieOptions(req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true';
  return `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function loginBlock(ip) {
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.windowStart >= LOGIN_WINDOW_MS) { loginFailures.delete(ip); return null; }
  if (entry.count >= LOGIN_MAX_FAILURES) return Math.ceil((LOGIN_WINDOW_MS - (Date.now() - entry.windowStart)) / 1000);
  return null;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { error: 'URL permintaan tidak valid.' }); }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const authenticated = hasValidSession(req);
    return send(res, 200, { ready: Boolean(API_KEY), model: MODEL, provider: PROVIDER_NAME, loginRequired: true, authenticated });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const ip = clientIp(req);
    const retryAfter = loginBlock(ip);
    if (retryAfter) { res.setHeader('Retry-After', String(retryAfter)); return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit.' }); }
    try {
      const { password } = await readBody(req);
      if (!constantTimeEqual(String(password || ''), APP_PASSWORD)) {
        let entry = loginFailures.get(ip);
        if (!entry || Date.now() - entry.windowStart >= LOGIN_WINDOW_MS) entry = { count: 0, windowStart: Date.now() };
        entry.count += 1; loginFailures.set(ip, entry);
        return send(res, 401, { error: 'Kata sandi tidak cocok.' });
      }
      loginFailures.delete(ip);
      const expiry = Date.now() + SESSION_MS;
      res.setHeader('Set-Cookie', `ruangai_session=${makeSession(expiry)}; Max-Age=${Math.floor(SESSION_MS / 1000)}; ${cookieOptions(req)}`);
      return send(res, 200, { ok: true });
    } catch (error) { return send(res, 400, { error: error.message || 'Permintaan login tidak valid.' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    res.setHeader('Set-Cookie', `ruangai_session=; Max-Age=0; ${cookieOptions(req)}`);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!hasValidSession(req)) return send(res, 401, { error: 'Silakan login kembali untuk melanjutkan.' });
    if (!API_KEY) return send(res, 503, { error: IS_OPENROUTER ? 'Kunci OpenRouter belum diatur pada environment server.' : 'API key belum diatur pada environment server.' });
    try {
      const { messages } = await readBody(req);
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) return send(res, 400, { error: 'Riwayat chat tidak valid.' });
      const safeMessages = messages.map(m => ({ role: ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'user', content: String(m?.content ?? '').slice(0, 12000) }));
      const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      if (IS_OPENROUTER) {
        headers['X-OpenRouter-Title'] = process.env.OPENROUTER_APP_TITLE || 'RuangAI';
        if (process.env.SITE_URL) headers['HTTP-Referer'] = process.env.SITE_URL;
      }
      const upstream = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: MODEL, messages: safeMessages, temperature: 0.7 })
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return send(res, upstream.status, { error: data?.error?.message || `API model mengembalikan HTTP ${upstream.status}.` });
      return send(res, 200, { reply: data?.choices?.[0]?.message?.content || 'Model tidak mengirim jawaban.' });
    } catch (error) { return send(res, 500, { error: error.message || 'Terjadi kesalahan pada server.' }); }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metode tidak didukung.' });
  const authenticated = hasValidSession(req);
  const loginAsset = ['/style.css', '/app.js'].includes(url.pathname);
  if (!authenticated && !loginAsset && url.pathname !== '/login' && url.pathname !== '/login/') {
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' }); return res.end();
  }
  const requested = url.pathname === '/login' || url.pathname === '/login/' || url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Akses ditolak.' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Halaman tidak ditemukan.' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});
server.listen(PORT, HOST, () => console.log(`Termux AI Webserver aktif di http://${HOST}:${PORT} (provider: ${PROVIDER_NAME}; model: ${MODEL}; login wajib)`));
