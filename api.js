const SUPABASE_URL = 'https://hvcerfxcfzoktzslqaqu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Y2VyZnhjZnpva3R6c2xxYXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDY0NzIsImV4cCI6MjEwMjM4MjQ3Mn0.NUfiEqIny4tT1c_Np4gZ9U6Yyl_bDkwGZOkLkA0hiBU';

function getAccessToken() { return localStorage.getItem('ca_token') || SUPABASE_ANON_KEY; }
function isLoggedIn() { return !!localStorage.getItem('ca_token'); }

function supaHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + getAccessToken(),
    'Content-Type': 'application/json'
  }, extra || {});
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Erreur de connexion');
  localStorage.setItem('ca_token', data.access_token);
  localStorage.setItem('ca_refresh', data.refresh_token);
  return data;
}

function logout() {
  localStorage.removeItem('ca_token');
  localStorage.removeItem('ca_refresh');
}

// ── CRUD REST générique ──────────────────────────────────────────────
async function sbSelect(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: supaHeaders() });
  if (res.status === 401) { logout(); location.reload(); return []; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsert(table, body, extraHeaders) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: supaHeaders(Object.assign({ Prefer: 'return=representation' }, extraHeaders || {})),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbUpdate(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: supaHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbDelete(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: supaHeaders()
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sbUpload(bucket, filePath, blob) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + getAccessToken(), 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: blob
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbSignedUrl(bucket, filePath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${filePath}`, {
    method: 'POST',
    headers: supaHeaders(),
    body: JSON.stringify({ expiresIn: 3600 })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

// ── Helpers ───────────────────────────────────────────────────────────
function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtEUR(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fmtDate(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('fr-FR'); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2); }

const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const MOIS_NUM = { JANVIER: '01', 'FÉVRIER': '02', FEVRIER: '02', MARS: '03', AVRIL: '04', MAI: '05', JUIN: '06', JUILLET: '07', 'AOÛT': '08', AOUT: '08', SEPTEMBRE: '09', OCTOBRE: '10', NOVEMBRE: '11', 'DÉCEMBRE': '12', DECEMBRE: '12' };
function moisActuel() { return MOIS[new Date().getMonth()]; }
