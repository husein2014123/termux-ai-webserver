const $ = id => document.getElementById(id);
const form = $('chat-form'), input = $('prompt'), messagesEl = $('messages');
const loginForm = $('login-form'), loginInput = $('login-password');
const LICENSE_SLOT = 'ruangai_license_session';
const history = [];
let busy = false, authenticated = false;
function currentLicense() { try { return sessionStorage.getItem(LICENSE_SLOT) || ''; } catch { return ''; } }
function clearLicense() { try { sessionStorage.removeItem(LICENSE_SLOT); } catch {} }
function setAuthenticated(value) {
  authenticated = value;
  $('app-shell').classList.toggle('locked', !value);
  $('auth-gate').hidden = value;
  $('logout-button').hidden = !value;
  if (!value) setTimeout(() => loginInput.focus(), 30);
}
async function getStatus() {
  const response = await fetch('/api/status', { cache: 'no-store' });
  return response.json();
}
async function verifyLicense(licenseKey) {
  const response = await fetch('/api/license/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey })
  });
  const data = await response.json();
  if (!response.ok || !data.valid) { const error = new Error(data.error || 'Key lisensi tidak valid.'); error.status = response.status; throw error; }
  return data;
}
async function checkStatus() {
  try {
    const data = await getStatus();
    $('status-dot').className = data.ready ? 'ready' : 'offline';
    $('status-text').textContent = data.ready ? 'Server lisensi siap' : 'Server belum dikonfigurasi';
    $('model-tag').textContent = data.model || 'OpenRouter';
    if (!data.ready) { setAuthenticated(false); return; }
    const key = currentLicense();
    if (!key) { setAuthenticated(false); return; }
    try { await verifyLicense(key); setAuthenticated(true); }
    catch (error) {
      if (error.status === 401) { clearLicense(); $('auth-error').textContent = 'Key tidak valid atau masa aktifnya telah berakhir.'; }
      else $('auth-error').textContent = error.message || 'Layanan lisensi sementara tidak tersedia.';
      setAuthenticated(false);
    }
  } catch {
    setAuthenticated(false); $('status-dot').className = 'offline'; $('status-text').textContent = 'Server tidak terjangkau';
  }
}
loginForm.addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  busy = true; $('login-button').disabled = true; $('auth-error').textContent = '';
  try {
    const licenseKey = loginInput.value.trim();
    await verifyLicense(licenseKey);
    try { sessionStorage.setItem(LICENSE_SLOT, licenseKey); }
    catch { throw new Error('Browser tidak dapat menyimpan key untuk sesi ini. Coba buka tab biasa.'); }
    loginInput.value = ''; setAuthenticated(true); input.focus();
  } catch (error) { $('auth-error').textContent = error.message || 'Verifikasi gagal. Coba kembali.'; loginInput.select(); }
  finally { busy = false; $('login-button').disabled = false; }
});
$('logout-button').addEventListener('click', async () => {
  clearLicense();
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  history.length = 0; messagesEl.replaceChildren(); $('welcome').hidden = false; setAuthenticated(false);
});
function addMessage(role, text, extra = '') {
  const node = document.createElement('article'); node.className = `message ${role} ${extra}`;
  if (role === 'assistant') {
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'RUANGAI'; node.append(label);
  }
  const body = document.createElement('div'); body.textContent = text; node.append(body); messagesEl.append(node);
  $('welcome').hidden = true; node.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return node;
}
async function submit(text) {
  text = text.trim(); if (!text || busy || !authenticated) return;
  busy = true; $('send-button').disabled = true; input.value = ''; input.style.height = 'auto';
  history.push({ role: 'user', content: text }); addMessage('user', text);
  const loader = document.createElement('div'); loader.className = 'typing'; loader.innerHTML = '<span></span><span></span><span></span>'; messagesEl.append(loader);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ licenseKey: currentLicense(), messages: history }) });
    const data = await response.json(); loader.remove();
    if (response.status === 401) { clearLicense(); setAuthenticated(false); throw new Error('Key tidak valid atau sudah kedaluwarsa.'); }
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    history.push({ role: 'assistant', content: data.reply }); addMessage('assistant', data.reply);
  } catch (error) { loader.remove(); addMessage('assistant', error.message, 'error'); history.pop(); }
  finally { busy = false; $('send-button').disabled = false; if (authenticated) input.focus(); }
}
form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => submit(button.dataset.prompt)));
checkStatus();
