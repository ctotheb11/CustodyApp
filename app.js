'use strict';
/* =====================================================================
   Custody Record — private, offline record keeping for an iPad.
   All data lives on this device in IndexedDB. Nothing is sent anywhere.
   ===================================================================== */

const APP_VERSION = '1.0.0';
const YNU = ['Yes', 'No', 'Unknown'];
const PEOPLE = ['{otherRole}', 'Stepmother', 'Grandparents', 'Grandmother', 'Grandfather', '{me}', 'Other'];

const DEFAULT_SETTINGS = {
  // Generic on purpose: the app code is hosted publicly; real names are entered in Settings and stay on the device.
  child: 'Child',
  me: 'Mother',
  other: 'Other parent',
  otherRole: 'Father',
  preparedBy: '',
  graceMin: 5,
  schedDefaults: {
    'Thursday possession': ['18:00', '20:00'],
    'Weekend possession': ['18:00', '18:00'],
  },
  pinHash: '',
  lastBackup: null,
};

/* Field types: date, time, text, long, select, combo.
   m = header pattern used when importing a spreadsheet column.
   priv = attorney / follow-up notes; can be left out of reports. */
const SCHEMA = {
  visits: {
    label: 'Visitation', one: 'Visit', prefix: 'VIS', icon: 'cal',
    help: 'One entry per possession or visit. Keep what you saw separate from what {child} told you.',
    filter: 'type',
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true, m: /^date$/ },
      { k: 'type', l: 'Possession type', t: 'select', m: /possession type/,
        o: ['Regular possession', 'Thursday possession', 'Weekend possession', 'Birthday / Holiday', 'Schedule change', 'Missed / Declined'] },
      { k: 'occurred', l: 'Did the possession happen?', t: 'select',
        o: ['Yes', 'Yes – agreed change to time/place', 'Missed', 'Cancelled by agreement', 'Unknown'],
        help: 'For an agreed change, pickup timing is left out of the on-time calculations. If the return time was also changed, enter the agreed time as the scheduled return.' },
      { k: 'notice', l: 'Advance notice of any change or cancellation?', t: 'select', o: ['Yes', 'No', 'Not applicable', 'Unknown'] },
      { k: 'schedPickup', l: 'Scheduled pickup', t: 'time', m: /scheduled pickup/ },
      { k: 'actualPickup', l: 'Actual pickup', t: 'time', m: /actual pickup/ },
      { k: 'schedReturn', l: 'Scheduled return', t: 'time', m: /scheduled return/ },
      { k: 'actualReturn', l: 'Actual return', t: 'time', m: /actual return/ },
      { k: 'pickedUpBy', l: 'Picked up by', t: 'combo', o: PEOPLE, m: /picked up by/ },
      { k: 'returnedBy', l: 'Returned by', t: 'combo', o: PEOPLE, m: /returned by/ },
      { k: 'inPersonTime', l: 'Approx. in-person time {child} spent with {other}', t: 'text',
        ph: 'e.g. none, 30 min, about 3 hours', help: 'Only if known. Say below whether you saw it or {child} reported it.' },
      { k: 'overnight', l: 'Where {child} stayed overnight', t: 'text' },
      { k: 'observed', l: 'What I observed', t: 'long', m: /what i observed/, help: 'Only what you directly saw or heard.' },
      { k: 'childReport', l: 'What {child} stated / experienced', t: 'long', m: /stated|experienced/,
        help: 'Use exact quotes only when you are confident of the wording.' },
      { k: 'source', l: 'Source / evidence', t: 'combo', m: /^source|evidence/,
        o: ['Personal observation', '{child} report', 'Personal observation / {child} report', 'Message / parenting app', 'Other'] },
    ],
  },
  activities: {
    label: 'School & Activities', one: 'Activity', prefix: 'ACT', icon: 'flag',
    help: 'One entry per appointment, game, practice, school event or meeting. Record Unknown when you do not know whether a parent attended — do not assume.',
    filter: 'category',
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true, m: /^date$/ },
      { k: 'time', l: 'Time', t: 'text', timeish: true, m: /^time$/, ph: 'e.g. 10:40 AM scheduled' },
      { k: 'category', l: 'Category', t: 'select', m: /^category$/,
        o: ['504 / school meeting', 'School event', 'Sports game', 'Sports practice', 'Medical appointment', 'Other'] },
      { k: 'event', l: 'Event / appointment', t: 'text', m: /^event/ },
      { k: 'location', l: 'Location', t: 'text', m: /^location$/ },
      { k: 'meAttended', l: '{me} attended?', t: 'select', o: YNU, attend: 'me' },
      { k: 'otherAttended', l: '{other} attended?', t: 'select', o: YNU, attend: 'other' },
      { k: 'others', l: 'Other attendees', t: 'text', m: /other attendees/ },
      { k: 'outcome', l: 'Outcome / brief facts', t: 'long', m: /outcome/ },
      { k: 'logId', l: 'Detailed log ID', t: 'text', m: /log id/, help: 'Use the same ID on an Incident Note to link them.' },
      { k: 'evidence', l: 'Evidence / link', t: 'text', m: /^evidence/ },
      { k: 'followUp', l: 'Follow-up needed', t: 'text', m: /^follow/, priv: true },
    ],
  },
  incidents: {
    label: 'Incident Notes', one: 'Incident note', prefix: 'INC', icon: 'note',
    help: 'One entry per incident. Separate direct observations, exact quotations, reported information and personal concerns.',
    fields: [
      { k: 'logId', l: 'Log ID', t: 'text', m: /log id/, ph: 'e.g. MEET-2026-10-29-01' },
      { k: 'date', l: 'Date', t: 'date', req: true, m: /^date$/ },
      { k: 'timeSetting', l: 'Time / setting', t: 'text', m: /^time.*setting/ },
      { k: 'relatedEvent', l: 'Related event', t: 'text', m: /related event/ },
      { k: 'people', l: 'People present', t: 'text', m: /people present/ },
      { k: 'observed', l: 'Directly observed facts', t: 'long', m: /directly observed/ },
      { k: 'quotes', l: 'Exact quotes (only if certain)', t: 'long', m: /exact quote/ },
      { k: 'reported', l: 'Reported by someone else', t: 'long', m: /reported by/ },
      { k: 'effect', l: 'Effect on event / child', t: 'long', m: /effect on/ },
      { k: 'response', l: 'My response / agreement', t: 'long', m: /my response/ },
      { k: 'evidence', l: 'Evidence / witnesses', t: 'text', m: /^evidence/ },
      { k: 'nextStep', l: 'Next step / attorney note', t: 'long', m: /next step|attorney/, priv: true },
    ],
  },
  discussions: {
    label: 'Parenting Discussions', one: 'Discussion', prefix: 'DIS', icon: 'chat',
    help: 'Schedule-related discussions, kept separate from school attendance. Quotes should be exact only when you are confident of the wording.',
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true, m: /^date$/ },
      { k: 'timePlace', l: 'Time / place', t: 'text', m: /^time.*place/ },
      { k: 'topic', l: 'Topic', t: 'text', m: /^topic/ },
      { k: 'otherStatement', l: '{other} request / statement', t: 'long', m: /request|statement/ },
      { k: 'myResponse', l: 'My response', t: 'long', m: /my response/ },
      { k: 'agreement', l: 'Agreement or change', t: 'long', m: /agreement/ },
      { k: 'impact', l: 'Impact on school activity', t: 'long', m: /impact/ },
      { k: 'evidence', l: 'Evidence / witness', t: 'text', m: /evidence|witness/ },
      { k: 'followUp', l: 'Follow-up / legal review', t: 'long', m: /follow|legal/, priv: true },
    ],
  },
  followups: {
    label: 'Follow-ups', one: 'Follow-up', prefix: 'FU', icon: 'check', noDate: true, priv: true,
    help: 'Tasks, kept separate from the factual record.',
    filter: 'status',
    fields: [
      { k: 'priority', l: 'Priority', t: 'select', o: ['High', 'Medium', 'Low'], m: /^priority/ },
      { k: 'status', l: 'Status', t: 'select', o: ['To do', 'In progress', 'Done', 'Not needed'], m: /^status/ },
      { k: 'task', l: 'Task', t: 'text', req: true, m: /^task/ },
      { k: 'related', l: 'Related date / event', t: 'text', m: /related/ },
      { k: 'notes', l: 'Notes / where saved', t: 'long', m: /^notes/ },
    ],
  },
};
const MODULES = Object.keys(SCHEMA);

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  cal: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  flag: 'M5 21V4M5 4h12l-2.5 4.5L17 13H5',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  chat: 'M4 5h16v11H9l-5 4z',
  check: 'M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17',
  chart: 'M3 20h18M6 20V11M11 20V5M16 20v-6M21 20V9',
  print: 'M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7z',
  gear: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = s => String(s ?? '').replace(/\{(child|me|other|otherRole)\}/g, (_, k) => S[k] || '');
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmtDate(s, long = true) {
  const d = parseISO(s);
  if (!d) return s || '';
  return d.toLocaleDateString('en-US', long ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const fmtStamp = ms => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
}
function fmtTime(t) {
  const m = toMin(t);
  if (m == null) return t || '';
  let h = Math.floor(m / 60) % 24;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m % 60)} ${ap}`;
}
function parseTimeText(s) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?\s*$/i.exec(s) || /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const mi = +(m[2] || 0);
  if (m[3]) { if (h === 12) h = 0; if (/p/i.test(m[3])) h += 12; }
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}
function parseDateText(s) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}
function excelDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function excelTime(n) {
  const mins = Math.round((n - Math.floor(n)) * 1440) % 1440;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}
function minsText(d) {
  const a = Math.abs(d);
  const t = a >= 60 ? `${Math.floor(a / 60)} h ${a % 60 ? (a % 60) + ' min' : ''}`.trim() : `${a} min`;
  return d > 0 ? `${t} late` : `${t} early`;
}
async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------------- storage (IndexedDB) ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('custody-record', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('records', { keyPath: 'id' });
        d.createObjectStore('attachments', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
        d.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      let out;
      const req = fn(t.objectStore(store));
      if (req) req.onsuccess = () => (out = req.result);
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  all: s => DB.tx(s, 'readonly', st => st.getAll()),
  get: (s, k) => DB.tx(s, 'readonly', st => st.get(k)),
  put: (s, v) => DB.tx(s, 'readwrite', st => st.put(v)),
  putMany: (s, arr) => DB.tx(s, 'readwrite', st => { arr.forEach(v => st.put(v)); }),
};

let S = structuredClone(DEFAULT_SETTINGS);
let R = [];
const ui = { range: { preset: 'all' }, search: {}, filter: {}, importPlan: null, report: null, locked: false };

async function saveSettings() { await DB.put('meta', { key: 'settings', value: S }); }
async function logEvent(type, detail) { await DB.put('events', { at: Date.now(), type, detail }); }
async function requestPersist() {
  if (requestPersist.done || !navigator.storage?.persist) return;
  requestPersist.done = true;
  try { await navigator.storage.persist(); } catch { /* not supported */ }
}

/* ---------------- records ---------------- */
const live = m => R.filter(r => r.module === m && !r.deleted);
const getRec = id => R.find(r => r.id === id);
const field = (m, k) => SCHEMA[m].fields.find(f => f.k === k);
const refNo = r => `${SCHEMA[r.module].prefix}-${String(r.seq).padStart(4, '0')}`;
const nextSeq = m => R.filter(r => r.module === m).reduce((a, r) => Math.max(a, r.seq), 0) + 1;

function sortRecs(m, list) {
  if (m === 'followups') {
    const so = ['To do', 'In progress', 'Done', 'Not needed'], po = ['High', 'Medium', 'Low'];
    const ix = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 9 : i; };
    return list.sort((a, b) => ix(so, a.data.status) - ix(so, b.data.status) || ix(po, a.data.priority) - ix(po, b.data.priority) || a.seq - b.seq);
  }
  return list.sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '') || b.seq - a.seq);
}

function displayValue(m, k, v) {
  const f = field(m, k);
  if (!f || v == null || v === '') return '';
  if (f.t === 'date') return fmtDate(v);
  if (f.t === 'time') return fmtTime(v);
  return v;
}

function newRecord(m, data, opts = {}) {
  const now = Date.now();
  return {
    id: uid(), module: m, seq: opts.seq ?? nextSeq(m), data,
    createdAt: now, updatedAt: now, deleted: false, attachments: [],
    origin: opts.origin || 'app', importKey: opts.importKey || null,
    history: [{ at: now, action: opts.origin === 'import' ? 'imported' : 'created', note: opts.note || '' }],
  };
}

async function saveRecord(m, id, data) {
  const now = Date.now();
  let rec = id && getRec(id);
  if (!rec) {
    rec = newRecord(m, data);
    R.push(rec);
  } else {
    const changes = [];
    const keys = new Set([...Object.keys(rec.data), ...Object.keys(data)]);
    for (const k of keys) {
      const a = rec.data[k] ?? '', b = data[k] ?? '';
      if (a !== b) changes.push({ field: k, from: a, to: b });
    }
    if (!changes.length) return rec;
    rec.history.push({ at: now, action: 'edited', changes });
    rec.data = data;
    rec.updatedAt = now;
  }
  await DB.put('records', rec);
  requestPersist();
  return rec;
}

/* ---------------- visit logic ---------------- */
const isMissed = r => /^missed/i.test(r.data.occurred || '') || /missed/i.test(r.data.type || '');
const isCancelled = r => /cancel/i.test(r.data.occurred || '');
const isAgreedChange = r => /agreed/i.test(r.data.occurred || '');
function isOtherParent(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  return [S.otherRole, S.other, 'father', 'dad'].filter(Boolean).some(x => n.includes(String(x).toLowerCase()) && !n.startsWith('step'));
}
function normPerson(s) {
  let v = String(s || '').trim();
  if (!v) return '';
  if (/^step\s*-?\s*(mom|mother)$/i.test(v)) return 'Stepmother';
  if (/^(dad|father)$/i.test(v)) return S.otherRole || 'Father';
  return v.charAt(0).toUpperCase() + v.slice(1);
}
// An agreed change only excuses the pickup; the return is still measured against its scheduled time.
function visitTiming(r) {
  if (isMissed(r) || isCancelled(r)) return { pick: null, ret: null };
  const d = r.data;
  const df = (a, s) => { const A = toMin(a), B = toMin(s); return A == null || B == null ? null : A - B; };
  return { pick: isAgreedChange(r) ? null : df(d.actualPickup, d.schedPickup), ret: df(d.actualReturn, d.schedReturn) };
}
function visitFlags(r) {
  const out = [], g = +S.graceMin || 0, d = r.data;
  if (isMissed(r)) out.push(['Missed', 'bad']);
  if (isCancelled(r)) out.push(['Cancelled by agreement', '']);
  if (isAgreedChange(r)) out.push(['Agreed change', '']);
  if (isMissed(r) && d.notice === 'No') out.push(['No advance notice', 'bad']);
  const t = visitTiming(r);
  if (t.pick != null && Math.abs(t.pick) > g) out.push([`Pickup ${minsText(t.pick)}`, 'warn']);
  if (t.ret != null && Math.abs(t.ret) > g) out.push([`Return ${minsText(t.ret)}`, 'warn']);
  if (d.pickedUpBy) out.push([`Picked up: ${normPerson(d.pickedUpBy)}`, '']);
  if (d.returnedBy && normPerson(d.returnedBy) !== normPerson(d.pickedUpBy)) out.push([`Returned: ${normPerson(d.returnedBy)}`, '']);
  return out;
}

function cardInfo(r) {
  const d = r.data;
  switch (r.module) {
    case 'visits':
      return { title: d.type || 'Visit', chips: visitFlags(r), snip: d.observed || d.childReport };
    case 'activities': {
      const chips = [];
      if (d.category) chips.push([d.category, '']);
      if (d.meAttended) chips.push([`${S.me}: ${d.meAttended}`, d.meAttended === 'Yes' ? 'ok' : '']);
      if (d.otherAttended) chips.push([`${S.other}: ${d.otherAttended}`, d.otherAttended === 'No' ? 'warn' : d.otherAttended === 'Yes' ? 'ok' : '']);
      return { title: d.event || d.category || 'Activity', chips, snip: d.outcome };
    }
    case 'incidents':
      return { title: d.relatedEvent || d.logId || 'Incident', chips: d.logId ? [[d.logId, '']] : [], snip: d.observed };
    case 'discussions':
      return { title: d.topic || 'Discussion', chips: d.timePlace ? [[d.timePlace, '']] : [], snip: d.otherStatement };
    case 'followups': {
      const chips = [];
      if (d.priority) chips.push([d.priority, d.priority === 'High' ? 'bad' : '']);
      if (d.status) chips.push([d.status, d.status === 'Done' ? 'ok' : '']);
      return { title: d.task || 'Task', chips, snip: d.notes };
    }
  }
  return { title: '', chips: [], snip: '' };
}
const chipsHTML = chips => chips.length ? `<div class="chips">${chips.map(([t, k]) => `<span class="chip ${k}">${esc(t)}</span>`).join('')}</div>` : '';

/* ---------------- date range ---------------- */
function bounds(r = ui.range) {
  const t = todayISO();
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n + 1); return iso(d); };
  switch (r.preset) {
    case '30': return { from: back(30), to: t };
    case '90': return { from: back(90), to: t };
    case '365': return { from: back(365), to: t };
    case 'ytd': return { from: `${new Date().getFullYear()}-01-01`, to: t };
    case 'custom': return { from: r.from || '', to: r.to || '' };
    default: return { from: '', to: '' };
  }
}
function within(date, b = bounds()) {
  if (!b.from && !b.to) return true;
  if (!date) return false;
  return (!b.from || date >= b.from) && (!b.to || date <= b.to);
}
function rangeText(b = bounds()) {
  if (!b.from && !b.to) return 'All entries';
  return `${b.from ? fmtDate(b.from, false) : 'Start'} – ${b.to ? fmtDate(b.to, false) : 'today'}`;
}
function rangeControl() {
  const r = ui.range;
  const opts = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['ytd', 'This year'], ['all', 'All time'], ['custom', 'Custom dates…']];
  return `<div class="range noprint">
    <label>Period<select data-range="preset">${opts.map(([v, l]) => `<option value="${v}"${r.preset === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${r.preset === 'custom' ? `<label>From<input type="date" data-range="from" value="${esc(r.from || '')}"></label><label>To<input type="date" data-range="to" value="${esc(r.to || '')}"></label>` : ''}
    <span class="range-text">${esc(rangeText())}</span></div>`;
}

/* ---------------- analysis ---------------- */
function analyze(b = bounds()) {
  const inR = m => live(m).filter(r => within(r.data.date, b));
  const V = inR('visits'), A = inR('activities');
  const g = +S.graceMin || 0;

  const missed = V.filter(isMissed), cancelled = V.filter(isCancelled);
  const took = V.filter(r => !isMissed(r) && !isCancelled(r));
  const pickKnown = took.filter(r => r.data.pickedUpBy), retKnown = took.filter(r => r.data.returnedBy);
  const count = (list, k) => {
    const m = new Map();
    list.forEach(r => { const p = normPerson(r.data[k]); m.set(p, (m.get(p) || 0) + 1); });
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const timing = [];
  V.forEach(r => {
    const t = visitTiming(r);
    if (t.pick != null && Math.abs(t.pick) > g) timing.push({ r, which: 'Pickup', sched: r.data.schedPickup, actual: r.data.actualPickup, diff: t.pick });
    if (t.ret != null && Math.abs(t.ret) > g) timing.push({ r, which: 'Return', sched: r.data.schedReturn, actual: r.data.actualReturn, diff: t.ret });
  });
  timing.sort((a, b) => a.r.data.date.localeCompare(b.r.data.date));

  const months = new Map();
  V.forEach(r => {
    const key = (r.data.date || '').slice(0, 7);
    if (!key) return;
    if (!months.has(key)) months.set(key, { key, logged: 0, other: 0, someone: 0, none: 0, missed: 0, otherRet: 0, latePick: 0, lateRet: 0 });
    const mo = months.get(key);
    mo.logged++;
    if (isMissed(r) || isCancelled(r)) mo.missed++;
    else if (!r.data.pickedUpBy) mo.none++;
    else if (isOtherParent(r.data.pickedUpBy)) mo.other++;
    else mo.someone++;
    if (!isMissed(r) && isOtherParent(r.data.returnedBy)) mo.otherRet++;
    const t = visitTiming(r);
    if (t.pick > g) mo.latePick++;
    if (t.ret > g) mo.lateRet++;
  });

  const att = who => {
    const c = { Yes: 0, No: 0, Unknown: 0 };
    A.forEach(r => { const v = r.data[who]; c[v === 'Yes' || v === 'No' ? v : 'Unknown']++; });
    return c;
  };
  const cats = new Map();
  A.forEach(r => {
    const k = r.data.category || 'Uncategorized';
    if (!cats.has(k)) cats.set(k, { cat: k, n: 0, me: { Yes: 0, No: 0, Unknown: 0 }, other: { Yes: 0, No: 0, Unknown: 0 } });
    const c = cats.get(k);
    c.n++;
    const mv = r.data.meAttended, ov = r.data.otherAttended;
    c.me[mv === 'Yes' || mv === 'No' ? mv : 'Unknown']++;
    c.other[ov === 'Yes' || ov === 'No' ? ov : 'Unknown']++;
  });

  const F = live('followups');
  const fu = {};
  F.forEach(r => { const s = r.data.status || 'No status'; fu[s] = (fu[s] || 0) + 1; });

  return {
    b, V, A,
    I: inR('incidents'), D: inR('discussions'), F, fu,
    missed, cancelled, took,
    missedNoNotice: missed.filter(r => r.data.notice === 'No').length,
    pickKnown: pickKnown.length, otherPick: pickKnown.filter(r => isOtherParent(r.data.pickedUpBy)).length,
    retKnown: retKnown.length, otherRet: retKnown.filter(r => isOtherParent(r.data.returnedBy)).length,
    pickBy: count(pickKnown, 'pickedUpBy'), retBy: count(retKnown, 'returnedBy'),
    timing,
    latePick: timing.filter(t => t.which === 'Pickup' && t.diff > 0).length,
    lateRet: timing.filter(t => t.which === 'Return' && t.diff > 0).length,
    earlyRet: timing.filter(t => t.which === 'Return' && t.diff < 0).length,
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    inPerson: V.filter(r => r.data.inPersonTime).sort((a, b) => a.data.date.localeCompare(b.data.date)),
    attMe: att('meAttended'), attOther: att('otherAttended'),
    cats: [...cats.values()],
  };
}
const monthLabel = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

/* ---------------- charts (HTML bars: text stays readable at any width) ---------------- */
const NONE = '<p class="muted small">Nothing recorded for this period.</p>';
function stacked(rows, keys, { legend = true } = {}) {
  if (!rows.length) return NONE;
  const max = Math.max(1, ...rows.map(r => keys.reduce((a, k) => a + (r.parts[k.key] || 0), 0)));
  const leg = legend ? `<div class="legend">${keys.map(k => `<span><i style="background:${k.color}"></i>${esc(k.label)}</span>`).join('')}</div>` : '';
  const body = rows.map(r => {
    const segs = keys.filter(k => r.parts[k.key]);
    const total = segs.reduce((a, k) => a + r.parts[k.key], 0);
    return `<div class="bar-row"><span class="bar-label">${esc(r.label)}</span><span class="bar-track">${segs.map(k =>
      `<span class="seg" style="width:${(r.parts[k.key] / max) * 85}%;background:${k.color}" data-tip="${esc(`${r.label} — ${k.label}: ${r.parts[k.key]}`)}"></span>`).join('')}
      <span class="bar-val">${total}</span></span></div>`;
  }).join('');
  return `${leg}<div class="bars" role="img" aria-label="Bar chart">${body}</div>`;
}
const hbar = (items, { color = 'var(--s1)' } = {}) =>
  items.length ? stacked(items.map(i => ({ label: i.label, parts: { v: i.value } })), [{ key: 'v', label: 'Count', color }], { legend: false }) : NONE;
const figure = (title, sub, inner) => `<figure class="chart"><figcaption>${esc(title)}</figcaption>${sub ? `<div class="cap-sub">${esc(sub)}</div>` : ''}${inner}</figure>`;

function table(head, rows, numCols = []) {
  if (!rows.length) return '<p class="muted small">Nothing recorded for this period.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h, i) => `<th${numCols.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function visitSummaryRows(a) {
  const g = +S.graceMin || 0;
  return [
    ['Possessions logged', a.V.length],
    ['Took place', a.took.length],
    ['Missed', a.missed.length + (a.missedNoNotice ? ` <span class="muted">(${a.missedNoNotice} recorded with no advance notice)</span>` : '')],
    ['Cancelled by agreement', a.cancelled.length],
    [`Pickups made by ${esc(S.otherRole)}`, `${a.otherPick} of ${a.pickKnown} with pickup recorded (${pct(a.otherPick, a.pickKnown)})`],
    [`Returns made by ${esc(S.otherRole)}`, `${a.otherRet} of ${a.retKnown} with return recorded (${pct(a.otherRet, a.retKnown)})`],
    [`Pickups more than ${g} min late`, a.latePick],
    [`Returns more than ${g} min late`, a.lateRet],
    [`Returns more than ${g} min early`, a.earlyRet],
  ].map(([k, v]) => [k, String(v)]);
}

function analysisHTML(a, { link = true } = {}) {
  const ref = r => link ? `<a href="#/m/${r.module}/${r.id}">${refNo(r)}</a>` : refNo(r);
  const monthRows = a.months.map(m => ({
    label: monthLabel(m.key),
    parts: { other: m.other, someone: m.someone, missed: m.missed, none: m.none },
  }));
  const keys = [
    { key: 'other', label: `Picked up by ${S.otherRole}`, color: 'var(--s1)' },
    { key: 'someone', label: 'Picked up by someone else', color: 'var(--s2)' },
    { key: 'missed', label: 'Missed / cancelled', color: 'var(--s3)' },
    { key: 'none', label: 'Pickup not recorded', color: 'var(--s-neutral)' },
  ];
  const attKeys = [
    { key: 'Yes', label: 'Attended', color: 'var(--s1)' },
    { key: 'No', label: 'Did not attend', color: 'var(--s2)' },
    { key: 'Unknown', label: 'Unknown / not recorded', color: 'var(--s-neutral)' },
  ];
  const att3 = c => `${c.Yes} / ${c.No} / ${c.Unknown}`;
  return `
  <div class="panel">
    <h2>Visitation</h2>
    <p class="sub">${esc(rangeText(a.b))}. Times within ${S.graceMin} minutes count as on time. Pickups marked as an agreed change are left out of timing.</p>
    ${table(['Measure', 'Result'], visitSummaryRows(a))}
    <div class="charts mt">
      ${figure('Who picked up each month', 'Each bar is one month of logged possessions.', stacked(monthRows, keys))}
      ${figure('Pickups by person', 'Possessions that took place, with pickup recorded.', hbar(a.pickBy))}
      ${figure('Returns by person', 'Possessions that took place, with return recorded.', hbar(a.retBy))}
    </div>
  </div>
  <div class="panel">
    <h2>Month by month</h2>
    ${table(['Month', 'Logged', 'Missed / cancelled', `${S.otherRole} picked up`, `${S.otherRole} returned`, 'Late pickups', 'Late returns'],
      a.months.map(m => [monthLabel(m.key), m.logged, m.missed, m.other, m.otherRet, m.latePick, m.lateRet].map(String)), [1, 2, 3, 4, 5, 6])}
  </div>
  <div class="panel">
    <h2>Exchange timing exceptions</h2>
    <p class="sub">Exchanges more than ${S.graceMin} minutes from the scheduled time.</p>
    ${table(['Date', 'Entry', 'Exchange', 'Scheduled', 'Actual', 'Difference'],
      a.timing.map(t => [esc(fmtDate(t.r.data.date)), ref(t.r), t.which, fmtTime(t.sched), fmtTime(t.actual), minsText(t.diff)]))}
  </div>
  ${a.missed.length || a.cancelled.length ? `<div class="panel"><h2>Missed and cancelled possessions</h2>
    ${table(['Date', 'Entry', 'Type', 'Status', 'Advance notice?'],
      [...a.missed, ...a.cancelled].sort((x, y) => x.data.date.localeCompare(y.data.date)).map(r => [esc(fmtDate(r.data.date)), ref(r), esc(r.data.type || ''), esc(r.data.occurred || 'Missed'), esc(r.data.notice || 'Not recorded')]))}</div>` : ''}
  ${a.inPerson.length ? `<div class="panel"><h2>In-person time with ${esc(S.other)}</h2>
    <p class="sub">As recorded on each entry. See the entry for whether it was observed or reported.</p>
    ${table(['Date', 'Entry', 'Type', 'Recorded time'], a.inPerson.map(r => [esc(fmtDate(r.data.date)), ref(r), esc(r.data.type || ''), esc(r.data.inPersonTime)]))}</div>` : ''}
  <div class="panel">
    <h2>School &amp; activity attendance</h2>
    <p class="sub">${plural(a.A.length, 'event')} in this period.</p>
    ${figure('Attendance by parent', '', stacked([{ label: S.me, parts: a.attMe }, { label: S.other, parts: a.attOther }], attKeys))}
    <div class="mt">${table(['Category', 'Events', `${S.me} (yes / no / unknown)`, `${S.other} (yes / no / unknown)`],
      a.cats.map(c => [esc(c.cat), String(c.n), att3(c.me), att3(c.other)]), [1])}</div>
  </div>`;
}

/* ---------------- views ---------------- */
function navHTML(active) {
  const item = (href, ic, label, key) => `<a href="${href}" class="${active === key ? 'on' : ''}">${icon(ic)}<span>${esc(label)}</span></a>`;
  return `<div class="brand"><b>Custody Record</b><span>${esc(S.child)}</span></div>
    ${item('#/home', 'home', 'Home', 'home')}
    <div class="sep"></div>
    ${MODULES.map(m => item(`#/m/${m}`, SCHEMA[m].icon, SCHEMA[m].label, m)).join('')}
    <div class="sep"></div>
    ${item('#/analysis', 'chart', 'Analysis', 'analysis')}
    ${item('#/reports', 'print', 'Reports', 'reports')}
    ${item('#/settings', 'gear', 'Settings', 'settings')}`;
}

function viewHome() {
  const a = analyze();
  const openFU = sortRecs('followups', live('followups').filter(r => !['Done', 'Not needed'].includes(r.data.status)));
  const recent = R.filter(r => !r.deleted).sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 6);
  const stale = R.length && (!S.lastBackup || Date.now() - S.lastBackup > 7 * 86400000);
  const notInstalled = navigator.standalone === false;
  const otherYes = a.attOther.Yes, otherKnown = a.A.length;
  return `
  <div class="page-head"><div><h1>${esc(S.child)}’s record</h1><p>Private record kept on this iPad. ${R.length ? '' : 'Start by importing your spreadsheets in Settings, or add an entry.'}</p></div></div>
  ${notInstalled ? `<div class="banner info"><span><b>Install this app:</b> tap the Share button, then <b>Add to Home Screen</b>. Open it from the Home Screen icon before entering data — Safari tabs and the installed app keep separate storage.</span></div>` : ''}
  ${S.child === DEFAULT_SETTINGS.child && S.other === DEFAULT_SETTINGS.other ? `<div class="banner info"><span><b>First step:</b> enter your child’s and the other parent’s names, then import your spreadsheets.</span><a class="btn small" href="#/settings">Open Settings</a></div>` : ''}
  ${stale ? `<div class="banner"><span>${S.lastBackup ? `Last backup ${fmtStamp(S.lastBackup)}.` : 'No backup yet.'} If this app is deleted, its data goes with it.</span><button class="btn small" data-act="backup">Back up now</button></div>` : ''}
  ${rangeControl()}
  <div class="tiles">
    <a class="tile" href="#/m/visits"><div class="k">Possessions logged</div><div class="v">${a.V.length}</div><div class="d">${a.took.length} took place</div></a>
    <a class="tile" href="#/analysis"><div class="k">Missed possessions</div><div class="v">${a.missed.length}</div><div class="d">${a.missedNoNotice} with no advance notice recorded</div></a>
    <a class="tile" href="#/analysis"><div class="k">Pickups by ${esc(S.otherRole)}</div><div class="v">${pct(a.otherPick, a.pickKnown)}</div><div class="d">${a.otherPick} of ${a.pickKnown} recorded pickups</div></a>
    <a class="tile" href="#/analysis"><div class="k">Late exchanges</div><div class="v">${a.latePick + a.lateRet}</div><div class="d">${a.latePick} pickups, ${a.lateRet} returns</div></a>
    <a class="tile" href="#/m/activities"><div class="k">${esc(S.other)} at activities</div><div class="v">${otherYes}<span class="muted" style="font-size:18px"> / ${otherKnown}</span></div><div class="d">events attended</div></a>
    <a class="tile" href="#/m/followups"><div class="k">Open follow-ups</div><div class="v">${openFU.length}</div><div class="d">${openFU.filter(r => r.data.priority === 'High').length} high priority</div></a>
  </div>
  <div class="panel"><h2>Add an entry</h2><div class="quick">
    ${MODULES.map(m => `<a class="btn" href="#/m/${m}/new">+ ${esc(SCHEMA[m].one)}</a>`).join('')}
  </div></div>
  ${openFU.length ? `<div class="panel"><h2>Open follow-ups</h2><div class="list">${openFU.slice(0, 5).map(cardHTML).join('')}</div></div>` : ''}
  ${recent.length ? `<div class="panel"><h2>Recently updated</h2><div class="list">${recent.map(cardHTML).join('')}</div></div>` : ''}`;
}

function cardHTML(r) {
  const c = cardInfo(r);
  const when = SCHEMA[r.module].noDate ? SCHEMA[r.module].label : fmtDate(r.data.date);
  return `<a class="card" href="#/m/${r.module}/${r.id}">
    <div class="card-top"><span class="ref">${refNo(r)}</span><span>${esc(when)}</span></div>
    <div class="card-title">${esc(c.title)}</div>${chipsHTML(c.chips)}
    ${c.snip ? `<div class="snip">${esc(c.snip)}</div>` : ''}</a>`;
}

function listItems(m) {
  const q = (ui.search[m] || '').toLowerCase().trim();
  const fk = SCHEMA[m].filter, fv = ui.filter[m] || '';
  const rows = sortRecs(m, live(m).filter(r =>
    (!fv || r.data[fk] === fv) &&
    (!q || refNo(r).toLowerCase().includes(q) || Object.values(r.data).some(v => String(v).toLowerCase().includes(q)))));
  return { rows, html: rows.length ? rows.map(cardHTML).join('') : `<div class="empty">${live(m).length ? 'No entries match.' : `No ${SCHEMA[m].label.toLowerCase()} entries yet.`}</div>` };
}

function viewList(m) {
  const sch = SCHEMA[m];
  const fk = sch.filter;
  const filterOpts = fk ? [...new Set([...field(m, fk).o, ...live(m).map(r => r.data[fk]).filter(Boolean)])] : [];
  const { rows, html } = listItems(m);
  return `
  <div class="page-head"><div><h1>${esc(sch.label)}</h1><p>${esc(L(sch.help))}</p></div>
    <div class="btns"><a class="btn primary" href="#/m/${m}/new">+ New ${esc(sch.one.toLowerCase())}</a></div></div>
  <div class="toolbar">
    <input type="search" placeholder="Search ${esc(sch.label.toLowerCase())}" value="${esc(ui.search[m] || '')}" data-search="${m}" aria-label="Search">
    ${fk ? `<select data-filter="${m}" aria-label="Filter"><option value="">All ${esc(field(m, fk).l.toLowerCase())}s</option>${filterOpts.map(o => `<option${ui.filter[m] === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
    <span class="count" id="count">${plural(rows.length, 'entry').replace('entrys', 'entries')}</span>
  </div>
  <div class="list" id="list">${html}</div>`;
}

function fieldInput(m, f, v) {
  const name = `name="${f.k}"`;
  const val = esc(v ?? '');
  let input;
  if (f.t === 'date') input = `<input type="date" ${name} value="${val}"${f.req ? ' required' : ''}>`;
  else if (f.t === 'time') input = `<input type="time" ${name} value="${toMin(v) != null ? val : ''}">${v && toMin(v) == null ? `<small>Recorded as: ${val}</small>` : ''}`;
  else if (f.t === 'long') input = `<textarea ${name} rows="5">${val}</textarea>`;
  else if (f.t === 'select') {
    const opts = f.o.map(L);
    if (v && !opts.includes(v)) opts.push(v);
    input = `<select ${name}><option value="">—</option>${opts.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else if (f.t === 'combo') {
    input = `<input type="text" ${name} value="${val}" list="dl-${f.k}" autocomplete="off"><datalist id="dl-${f.k}">${f.o.map(o => `<option value="${esc(L(o))}">`).join('')}</datalist>`;
  } else input = `<input type="text" ${name} value="${val}"${f.ph ? ` placeholder="${esc(L(f.ph))}"` : ''}${f.req ? ' required' : ''}>`;
  const wide = f.t === 'long' || (f.t === 'text' && !['time', 'logId'].includes(f.k)) || f.t === 'combo' && f.k === 'source';
  return `<label class="field${wide ? ' full' : ''}"><span class="lbl">${esc(L(f.l))}${f.req ? ' <span class="req">*</span>' : ''}</span>${input}${f.help ? `<small>${esc(L(f.help))}</small>` : ''}</label>`;
}

function viewForm(m, id) {
  const sch = SCHEMA[m];
  const rec = id ? getRec(id) : null;
  if (id && !rec) return notFound();
  const data = rec ? rec.data : (sch.noDate ? { status: 'To do', priority: 'Medium' } : { date: todayISO() });
  return `
  <a class="crumb" href="${rec ? `#/m/${m}/${id}` : `#/m/${m}`}">‹ ${rec ? refNo(rec) : esc(sch.label)}</a>
  <div class="page-head"><div><h1>${rec ? `Edit ${refNo(rec)}` : `New ${esc(sch.one.toLowerCase())}`}</h1>
    ${rec ? '<p>Your changes are added to this entry’s edit history.</p>' : ''}</div></div>
  <form id="recform" data-module="${m}" data-id="${id || ''}" class="panel" autocomplete="off">
    <div class="form-grid">${sch.fields.map(f => fieldInput(m, f, data[f.k])).join('')}</div>
    <div class="form-actions"><button class="btn primary" type="submit">Save</button>
      <a class="btn" href="${rec ? `#/m/${m}/${id}` : `#/m/${m}`}">Cancel</a></div>
  </form>`;
}

function historyHTML(rec) {
  const lbl = k => L(field(rec.module, k)?.l || k);
  const short = v => { const s = displayValue(rec.module, '', v) || String(v); return s.length > 120 ? s.slice(0, 120) + '…' : s; };
  return `<ul class="hist">${rec.history.map(h => `<li><span class="when">${fmtStamp(h.at)}</span> — <b>${esc(h.action.charAt(0).toUpperCase() + h.action.slice(1))}</b>${h.note ? ` <span class="muted">${esc(h.note)}</span>` : ''}
    ${h.changes ? h.changes.map(c => `<div class="chg">${esc(lbl(c.field))}: “${esc(short(c.from) || '(blank)')}” → “${esc(short(c.to) || '(blank)')}”</div>`).join('') : ''}</li>`).join('')}</ul>`;
}

function fieldsHTML(rec, { omitPrivate = false } = {}) {
  const sch = SCHEMA[rec.module];
  const shown = sch.fields.filter(f => rec.data[f.k] && !(omitPrivate && f.priv));
  const short = shown.filter(f => f.t !== 'long'), long = shown.filter(f => f.t === 'long');
  let extra = '';
  if (rec.module === 'visits') {
    const t = visitTiming(rec), g = +S.graceMin || 0;
    const tt = d => d == null ? null : Math.abs(d) <= g ? 'On time' : minsText(d);
    if (tt(t.pick)) extra += `<div><span>Pickup timing</span>${esc(tt(t.pick))}</div>`;
    if (tt(t.ret)) extra += `<div><span>Return timing</span>${esc(tt(t.ret))}</div>`;
  }
  return `<div class="kv">${short.map(f => `<div><span>${esc(L(f.l))}</span>${esc(displayValue(rec.module, f.k, rec.data[f.k]))}</div>`).join('')}${extra}</div>
    ${long.map(f => `<div class="narr"><h3>${esc(L(f.l))}</h3><p>${esc(rec.data[f.k])}</p></div>`).join('')}`;
}

function viewDetail(m, id) {
  const rec = getRec(id);
  if (!rec || rec.module !== m) return notFound();
  const sch = SCHEMA[m];
  const c = cardInfo(rec);
  let links = '';
  if (m === 'activities' && rec.data.logId) {
    const inc = live('incidents').filter(r => r.data.logId === rec.data.logId);
    if (inc.length) links = `<div class="panel"><h2>Linked incident notes</h2><div class="list">${inc.map(cardHTML).join('')}</div></div>`;
  }
  if (m === 'incidents' && rec.data.logId) {
    const acts = live('activities').filter(r => r.data.logId === rec.data.logId);
    if (acts.length) links = `<div class="panel"><h2>Linked activities</h2><div class="list">${acts.map(cardHTML).join('')}</div></div>`;
  }
  const imported = rec.origin === 'import';
  return `
  <a class="crumb" href="#/m/${m}">‹ ${esc(sch.label)}</a>
  <div class="page-head"><div><div class="muted small"><span class="ref">${refNo(rec)}</span>${sch.noDate ? '' : ` · ${esc(fmtDate(rec.data.date))}`}</div>
    <h1>${esc(c.title)}</h1></div>
    <div class="btns"><a class="btn primary" href="#/m/${m}/${id}/edit">Edit</a><button class="btn danger" data-act="delete" data-id="${id}">Delete</button></div></div>
  ${chipsHTML(c.chips)}
  <div class="panel">${fieldsHTML(rec)}</div>
  ${links}
  <div class="panel"><h2>Photos &amp; documents</h2>
    <div class="atts" id="atts" data-rec="${id}"><span class="muted small">Loading…</span></div>
    <label class="btn filebtn">+ Add photo or file<input type="file" accept="image/*,application/pdf" multiple data-file="attach" data-id="${id}"></label>
    <p class="muted small mt">Files are stored only on this iPad and are included in backups. A SHA-256 fingerprint is recorded for each file when it is added.</p>
  </div>
  <div class="panel"><h2>Record history</h2>
    <p class="sub">Entered ${fmtStamp(rec.createdAt)}${imported ? ' (imported from spreadsheet)' : ''}. ${rec.updatedAt !== rec.createdAt ? `Last changed ${fmtStamp(rec.updatedAt)}.` : 'Not changed since.'}</p>
    ${historyHTML(rec)}</div>`;
}

async function fillAttachments() {
  const box = $('#atts');
  if (!box) return;
  const rec = getRec(box.dataset.rec);
  const atts = (await Promise.all(rec.attachments.map(id => DB.get('attachments', id)))).filter(a => a && !a.removed);
  if (!atts.length) { box.innerHTML = '<span class="muted small">None yet.</span>'; return; }
  box.innerHTML = atts.map(a => {
    const url = URL.createObjectURL(new Blob([a.data], { type: a.type }));
    const preview = a.type.startsWith('image/') ? `<img src="${url}" alt="${esc(a.name)}">` : `<div class="att-doc">PDF</div>`;
    return `<div class="att"><a href="${url}" target="_blank" rel="noopener">${preview}</a><div class="att-meta">${esc(a.name)}<br><span class="muted">Added ${fmtStamp(a.addedAt)}</span><br>
      <button data-act="rm-att" data-id="${a.id}" data-rec="${rec.id}">Remove</button></div></div>`;
  }).join('');
}

async function addAttachments(recId, files) {
  const rec = getRec(recId);
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const hash = await sha256Hex(buf);
    const att = { id: uid(), recordId: recId, name: f.name, type: f.type || 'application/octet-stream', size: f.size, addedAt: Date.now(), sha256: hash, data: buf };
    await DB.put('attachments', att);
    rec.attachments.push(att.id);
    rec.history.push({ at: Date.now(), action: 'file added', note: `${f.name} (SHA-256 ${hash.slice(0, 16)}…)` });
  }
  rec.updatedAt = Date.now();
  await DB.put('records', rec);
  toast(`${plural(files.length, 'file')} added`);
  render();
}

function viewAnalysis() {
  return `<div class="page-head"><div><h1>Analysis</h1><p>Summaries calculated from your entries. Tap an entry number to open it.</p></div></div>
    ${rangeControl()}${analysisHTML(analyze())}`;
}

/* ---------------- reports ---------------- */
function viewReports() {
  const o = ui.report || { title: `${S.child} — Parenting Time and Activity Record`, summary: true, visits: true, activities: true, incidents: true, discussions: true, followups: false, omitPrivate: true, history: false, photos: false };
  const cb = (k, l, hint = '') => `<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0"><input type="checkbox" name="${k}" ${o[k] ? 'checked' : ''} style="width:22px;min-height:22px;margin-top:2px"><span>${esc(l)}${hint ? `<br><small class="muted">${esc(hint)}</small>` : ''}</span></label>`;
  return `<div class="page-head"><div><h1>Reports</h1><p>Build a printable report for your attorney or the court. On the next screen, tap <b>Print / Save PDF</b>, then use the Share button in the print preview to save a PDF to Files or email it.</p></div></div>
  ${rangeControl()}
  <form id="reportform" class="panel">
    <div class="settings-grid">
      <label class="field full" style="grid-column:1/-1"><span class="lbl">Report title</span><input name="title" value="${esc(o.title)}"></label>
      <label class="field"><span class="lbl">Prepared by</span><input name="preparedBy" value="${esc(S.preparedBy)}" placeholder="Your name"></label>
    </div>
    <h3 class="mt">Include</h3>
    ${cb('summary', 'Summary and analysis', 'Counts, timing exceptions, attendance and charts.')}
    ${cb('visits', 'Visitation log')}
    ${cb('activities', 'School & activity log')}
    ${cb('incidents', 'Incident notes')}
    ${cb('discussions', 'Parenting discussions')}
    ${cb('followups', 'Follow-up checklist', 'Usually kept private — it is a to-do list, not part of the factual record.')}
    <h3 class="mt">Options</h3>
    ${cb('omitPrivate', 'Leave out attorney notes and follow-up fields', 'Hides “Next step / attorney note”, “Follow-up / legal review” and “Follow-up needed”.')}
    ${cb('history', 'Include each entry’s edit history')}
    ${cb('photos', 'Include photos')}
    <div class="form-actions"><button class="btn primary" type="submit">Create report</button></div>
  </form>
  <div class="panel"><h2>Spreadsheet export</h2><p class="sub">CSV files open in Excel or Numbers. Each includes entry numbers and entered/edited times.</p>
    <div class="quick">${MODULES.map(m => `<button class="btn small" data-act="csv" data-m="${m}">${esc(SCHEMA[m].label)}</button>`).join('')}</div></div>`;
}

function reportEntry(rec, o) {
  const sch = SCHEMA[rec.module];
  const c = cardInfo(rec);
  const chips = rec.module === 'visits' ? chipsHTML(visitFlags(rec).filter(x => x[1])) : '';
  const edits = rec.history.filter(h => h.action === 'edited').length;
  return `<div class="entry">
    <div class="entry-head"><span>${refNo(rec)}${sch.noDate ? '' : ` · ${esc(fmtDate(rec.data.date))}`} · ${esc(c.title)}</span></div>
    ${chips}${fieldsHTML(rec, { omitPrivate: o.omitPrivate })}
    ${o.photos && rec.attachments.length ? `<div class="photos" data-photos="${rec.id}"></div>` : ''}
    <div class="entry-foot">Entered ${fmtStamp(rec.createdAt)}${rec.origin === 'import' ? ' (imported from spreadsheet)' : ''} · ${edits ? `Edited ${plural(edits, 'time')}, last ${fmtStamp(rec.updatedAt)}` : 'Not edited'}${rec.attachments.length ? ` · ${plural(rec.attachments.length, 'attached file')}` : ''}
    ${o.history && rec.history.length > 1 ? `<div class="mt">${historyHTML(rec)}</div>` : ''}</div>
  </div>`;
}

function viewReport() {
  const o = ui.report;
  if (!o) { location.hash = '#/reports'; return ''; }
  const a = analyze();
  const sections = [];
  const included = [];
  for (const m of MODULES) {
    if (!o[m]) continue;
    // logs read oldest-first in a report; follow-ups keep their status/priority order
    const recs = m === 'followups' ? sortRecs(m, live(m)) : sortRecs(m, a[{ visits: 'V', activities: 'A', incidents: 'I', discussions: 'D' }[m]].slice()).reverse();
    included.push(...recs);
    let top = '';
    if (m === 'visits' && recs.length) {
      top = table(['Entry', 'Date', 'Type', 'Pickup (sched / actual)', 'Return (sched / actual)', 'Picked up by', 'Returned by'],
        recs.map(r => [refNo(r), esc(fmtDate(r.data.date, false)), esc(r.data.type || ''),
          isMissed(r) ? 'Missed' : `${fmtTime(r.data.schedPickup) || '—'} / ${fmtTime(r.data.actualPickup) || '—'}`,
          isMissed(r) ? 'Missed' : `${fmtTime(r.data.schedReturn) || '—'} / ${fmtTime(r.data.actualReturn) || '—'}`,
          esc(r.data.pickedUpBy || ''), esc(r.data.returnedBy || '')])) + '<div class="mt"></div>';
    }
    if (m === 'activities' && recs.length) {
      top = table(['Entry', 'Date', 'Category', 'Event', `${S.me} attended`, `${S.other} attended`],
        recs.map(r => [refNo(r), esc(fmtDate(r.data.date, false)), esc(r.data.category || ''), esc(r.data.event || ''), esc(r.data.meAttended || '—'), esc(r.data.otherAttended || '—')])) + '<div class="mt"></div>';
    }
    sections.push(`<h2>${esc(SCHEMA[m].label)} (${recs.length})</h2>${top}${recs.length ? recs.map(r => reportEntry(r, o)).join('') : '<p class="muted">No entries in this period.</p>'}`);
  }
  logEvent('report', `${o.title} — ${rangeText()} — ${included.length} entries`);
  queueMicrotask(async () => {
    const payload = JSON.stringify(included.map(r => ({ ref: refNo(r), data: r.data, createdAt: r.createdAt, updatedAt: r.updatedAt })));
    const h = await sha256Hex(payload);
    const el = $('#fingerprint');
    if (el) el.textContent = h;
    if (o.photos) {
      for (const box of document.querySelectorAll('[data-photos]')) {
        const rec = getRec(box.dataset.photos);
        const atts = (await Promise.all(rec.attachments.map(id => DB.get('attachments', id)))).filter(x => x && !x.removed && x.type.startsWith('image/'));
        box.innerHTML = atts.map(x => `<img src="${URL.createObjectURL(new Blob([x.data], { type: x.type }))}" alt="${esc(x.name)}">`).join('');
      }
    }
  });
  return `<div class="report-bar btns noprint"><a class="btn" href="#/reports">‹ Back</a><button class="btn primary" data-act="print">Print / Save PDF</button></div>
  <article class="report">
    <h1>${esc(o.title)}</h1>
    <div class="meta">Period: ${esc(rangeText())}${S.preparedBy ? ` · Prepared by ${esc(S.preparedBy)}` : ''} · Generated ${fmtStamp(Date.now())}</div>
    <div class="note">Each entry has a permanent entry number (for example ${SCHEMA.visits.prefix}-0001). “Entered” is when the entry was first saved in this app; entries marked “imported from spreadsheet” were transferred from an earlier spreadsheet on that date. Every later change is recorded in the entry’s edit history. Observations by the author are recorded separately from statements reported by ${esc(S.child)} or others.</div>
    ${o.summary ? `<h2>Summary</h2>${analysisHTML(a, { link: false }).replace(/class="panel"/g, 'class="rsec"')}` : ''}
    ${sections.join('')}
    <div class="foot">Report contents fingerprint (SHA-256): <span id="fingerprint">calculating…</span><br>Custody Record ${APP_VERSION}. The fingerprint changes if any included entry is changed.</div>
  </article>`;
}

function csvFor(m) {
  const sch = SCHEMA[m];
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Entry', ...sch.fields.map(f => L(f.l)), 'Entered', 'Last changed', 'Origin'];
  const rows = sortRecs(m, live(m)).reverse().map(r => [refNo(r), ...sch.fields.map(f => f.t === 'time' ? fmtTime(r.data[f.k]) : r.data[f.k] ?? ''), fmtStamp(r.createdAt), fmtStamp(r.updatedAt), r.origin]);
  return '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}

/* ---------------- settings, import, backup ---------------- */
function viewSettings() {
  const deleted = R.filter(r => r.deleted).length;
  const t = S.schedDefaults['Thursday possession'] || ['', ''], w = S.schedDefaults['Weekend possession'] || ['', ''];
  return `<div class="page-head"><div><h1>Settings</h1><p>Everything here stays on this iPad.</p></div></div>

  <div class="panel"><h2>Import from Excel</h2>
    <p class="sub">Choose your .xlsx or .xlsm files (save them to the Files app first). Sheets are matched by their column headings. Rows already imported are skipped, so importing the same file twice is safe.</p>
    <label class="btn filebtn">Choose spreadsheet files<input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" multiple data-file="import"></label>
    <div id="importplan" class="import-plan">${importPlanHTML()}</div>
  </div>

  <div class="panel"><h2>Backup &amp; restore</h2>
    <p class="sub">${S.lastBackup ? `Last backup: ${fmtStamp(S.lastBackup)}.` : 'No backup yet.'} A backup is one file containing every entry, photo and edit history. Save it to iCloud Drive or another safe place.</p>
    <div class="quick"><button class="btn primary" data-act="backup">Back up now</button>
      <label class="btn filebtn">Restore from backup<input type="file" accept=".json,application/json" data-file="restore"></label></div>
  </div>

  <form id="settingsform" class="panel"><h2>Names &amp; schedule</h2>
    <p class="sub">Used for labels, analysis and reports.</p>
    <div class="settings-grid">
      <label class="field"><span class="lbl">Child’s name</span><input name="child" value="${esc(S.child)}"></label>
      <label class="field"><span class="lbl">Your label</span><input name="me" value="${esc(S.me)}"><small>As it appears in your records, e.g. “Mother”.</small></label>
      <label class="field"><span class="lbl">Other parent’s name</span><input name="other" value="${esc(S.other)}"></label>
      <label class="field"><span class="lbl">Other parent’s role</span><input name="otherRole" value="${esc(S.otherRole)}"><small>Matched against “Picked up by”.</small></label>
      <label class="field"><span class="lbl">Prepared by (reports)</span><input name="preparedBy" value="${esc(S.preparedBy)}"></label>
      <label class="field"><span class="lbl">On-time window (minutes)</span><input name="graceMin" type="number" min="0" max="60" value="${esc(S.graceMin)}"></label>
      <label class="field"><span class="lbl">Thursday pickup / return</span><div style="display:flex;gap:8px"><input type="time" name="thuP" value="${t[0]}"><input type="time" name="thuR" value="${t[1]}"></div><small>Filled in automatically on new Thursday visits.</small></label>
      <label class="field"><span class="lbl">Weekend pickup / return</span><div style="display:flex;gap:8px"><input type="time" name="wkP" value="${w[0]}"><input type="time" name="wkR" value="${w[1]}"></div></label>
    </div>
    <div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>
  </form>

  <div class="panel"><h2>Passcode</h2>
    <p class="sub">${S.pinHash ? 'A passcode is set. The app locks whenever it is closed or put in the background.' : 'Optional extra lock when opening the app. Your iPad’s own passcode is still the main protection.'}</p>
    <div class="quick"><button class="btn" data-act="pin-set">${S.pinHash ? 'Change passcode' : 'Set passcode'}</button>${S.pinHash ? '<button class="btn danger" data-act="pin-clear">Remove passcode</button>' : ''}</div>
  </div>

  <div class="panel"><h2>Storage</h2>
    <p class="sub" id="storageinfo">${R.filter(r => !r.deleted).length} entries.</p>
    <a class="btn small" href="#/deleted">Deleted entries (${deleted})</a>
  </div>

  <div class="panel"><h2>App activity log</h2><p class="sub">Imports, backups, restores and reports.</p><div id="eventlog" class="small muted">Loading…</div></div>
  <p class="muted small">Custody Record ${APP_VERSION}. No data leaves this device unless you export, share or print it yourself.</p>`;
}

async function fillSettingsExtras() {
  const el = $('#eventlog');
  if (el) {
    const ev = (await DB.all('events')).sort((a, b) => b.at - a.at).slice(0, 40);
    el.innerHTML = ev.length ? `<ul class="hist">${ev.map(e => `<li><span class="when">${fmtStamp(e.at)}</span> — <b>${esc(e.type)}</b> ${esc(e.detail || '')}</li>`).join('')}</ul>` : 'Nothing yet.';
  }
  const si = $('#storageinfo');
  if (si && navigator.storage?.persisted) {
    const p = await navigator.storage.persisted();
    si.textContent += p ? ' Storage is marked persistent.' : ' Storage is not yet marked persistent — it will be requested when you save data. Keep regular backups.';
  }
}

function viewDeleted() {
  const del = R.filter(r => r.deleted).sort((a, b) => b.deletedAt - a.deletedAt);
  return `<a class="crumb" href="#/settings">‹ Settings</a><div class="page-head"><div><h1>Deleted entries</h1><p>Deleted entries are hidden from lists and reports but kept here, with their history, so nothing is lost.</p></div></div>
  ${del.length ? `<div class="list">${del.map(r => `<div class="card"><div class="card-top"><span class="ref">${refNo(r)}</span><span>Deleted ${fmtStamp(r.deletedAt)}</span></div>
    <div class="card-title">${esc(cardInfo(r).title)}</div><div class="snip">Reason: ${esc(r.deleteReason || '—')}</div>
    <button class="btn small mt" data-act="undelete" data-id="${r.id}">Restore</button></div>`).join('')}</div>` : '<div class="empty">No deleted entries.</div>'}`;
}

/* ---- xlsx reading (no external libraries) ---- */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This does not look like an Excel (.xlsx / .xlsm) file.');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nlen + elen + clen;
  }
  return async name => {
    const f = files[name];
    if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = u8.subarray(start, start + f.size);
    if (f.method === 0) return dec.decode(data);
    if (f.method === 8) {
      const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      return dec.decode(out);
    }
    throw new Error('Unsupported compression in spreadsheet.');
  };
}
function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}
async function readWorkbook(buf) {
  const read = await unzip(buf);
  const P = s => new DOMParser().parseFromString(s, 'application/xml');
  const wb = P(await read('xl/workbook.xml'));
  const rels = P(await read('xl/_rels/workbook.xml.rels'));
  const relMap = {};
  for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const shared = [];
  const ssTxt = await read('xl/sharedStrings.xml');
  if (ssTxt) {
    for (const si of P(ssTxt).getElementsByTagName('si')) {
      let t = '';
      for (const n of si.getElementsByTagName('t')) if (n.parentNode.nodeName !== 'rPh') t += n.textContent;
      shared.push(t);
    }
  }
  const sheets = [];
  for (const sh of wb.getElementsByTagName('sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relMap[rid];
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = await read(target);
    if (!xml) continue;
    const rows = [];
    for (const row of P(xml).getElementsByTagName('row')) {
      const cells = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = null;
        if (t === 's' && v) val = shared[+v.textContent];
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(n => n.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
        else if (t === 'b') val = v ? (v.textContent === '1' ? 'TRUE' : 'FALSE') : null;
        else if (v) val = Number(v.textContent);
        if (val !== null && val !== '') cells[colIndex(c.getAttribute('r'))] = val;
      }
      rows.push({ r: +row.getAttribute('r'), cells });
    }
    sheets.push({ name: sh.getAttribute('name'), rows });
  }
  return sheets;
}

const normH = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function mapHeaders(m, cells) {
  const fields = SCHEMA[m].fields, used = new Set(), map = {};
  const otherWords = [S.other, S.otherRole, 'father', 'dad'].map(normH).filter(Boolean);
  cells.forEach((h, i) => {
    if (typeof h !== 'string') return;
    const n = normH(h);
    if (!n) return;
    let key = null;
    if (/attended/.test(n) && fields.some(f => f.attend)) {
      key = otherWords.some(w => n.includes(w)) ? 'otherAttended' : 'meAttended';
      if (used.has(key)) key = key === 'meAttended' ? 'otherAttended' : 'meAttended';
    } else {
      key = fields.find(f => f.m && !used.has(f.k) && f.m.test(n))?.k || null;
    }
    if (key && !used.has(key)) { used.add(key); map[i] = key; }
  });
  return map;
}
function detectSheet(sheet) {
  let best = null;
  for (const m of MODULES) {
    for (const row of sheet.rows.slice(0, 12)) {
      const map = mapHeaders(m, row.cells);
      const score = Object.keys(map).length;
      if (score >= 3 && (!best || score > best.score)) best = { module: m, headerRow: row.r, map, score };
    }
  }
  return best;
}
function convertRow(m, cells, map) {
  const data = {};
  let missed = false;
  for (const [i, k] of Object.entries(map)) {
    const f = field(m, k);
    let v = cells[i];
    if (v == null) continue;
    if (typeof v === 'string') { v = v.trim(); if (!v) continue; }
    if (f.t === 'date') v = typeof v === 'number' ? excelDate(v) : (parseDateText(v) || v);
    else if (f.t === 'time') {
      if (typeof v === 'number') v = excelTime(v);
      else if (/missed/i.test(v)) { missed = true; continue; }
      else v = parseTimeText(v) || v;
    } else if (typeof v === 'number' && f.timeish && v < 1) v = fmtTime(excelTime(v));
    else v = String(v);
    data[k] = v;
  }
  if (!Object.keys(data).length) return null;
  if (m === 'visits') {
    if (missed || /missed/i.test(data.type || '')) data.occurred = 'Missed';
    else if (data.actualPickup || data.actualReturn) data.occurred = 'Yes';
  }
  return data;
}

async function planImport(files) {
  const plan = [];
  const known = new Set(R.map(r => r.importKey).filter(Boolean));
  for (const file of files) {
    let sheets;
    try { sheets = await readWorkbook(await file.arrayBuffer()); }
    catch (e) { plan.push({ file: file.name, error: e.message }); continue; }
    for (const sh of sheets) {
      const det = detectSheet(sh);
      if (!det) { plan.push({ file: file.name, sheet: sh.name, skipped: true }); continue; }
      const items = [];
      for (const row of sh.rows) {
        if (row.r <= det.headerRow) continue;
        const data = convertRow(det.module, row.cells, det.map);
        if (!data) continue;
        const key = det.module + ':' + await sha256Hex(JSON.stringify(Object.entries(data).sort()));
        items.push({ data, key, row: row.r, dup: known.has(key) || items.some(x => x.key === key) });
      }
      plan.push({ file: file.name, sheet: sh.name, module: det.module, items });
    }
  }
  ui.importPlan = plan;
}

function importPlanHTML() {
  const p = ui.importPlan;
  if (!p) return '';
  const total = p.reduce((a, x) => a + (x.items ? x.items.filter(i => !i.dup).length : 0), 0);
  return `${table(['File', 'Sheet', 'Goes to', 'New', 'Already imported'], p.map(x => [
    esc(x.file), esc(x.sheet || ''),
    x.error ? `<span class="chip bad">${esc(x.error)}</span>` : x.skipped ? '<span class="muted">Not recognised — skipped</span>' : esc(SCHEMA[x.module].label),
    x.items ? String(x.items.filter(i => !i.dup).length) : '', x.items ? String(x.items.filter(i => i.dup).length) : '']), [3, 4])}
    <div class="quick mt">${total ? `<button class="btn primary" data-act="import-go">Import ${plural(total, 'entry').replace('entrys', 'entries')}</button>` : '<span class="muted">Nothing new to import.</span>'}
    <button class="btn" data-act="import-cancel">Cancel</button></div>`;
}

async function runImport() {
  const out = [];
  const seqs = {};
  let n = 0;
  for (const x of ui.importPlan) {
    if (!x.items) continue;
    for (const it of x.items) {
      if (it.dup) continue;
      seqs[x.module] = seqs[x.module] || nextSeq(x.module);
      const rec = newRecord(x.module, it.data, { seq: seqs[x.module]++, origin: 'import', importKey: it.key, note: `from “${x.file}” › ${x.sheet}, row ${it.row}` });
      out.push(rec);
      n++;
    }
  }
  out.sort((a, b) => a.module.localeCompare(b.module) || (a.data.date || '').localeCompare(b.data.date || ''));
  // renumber per module in date order so entry numbers follow the timeline
  const bump = {};
  for (const r of out) { bump[r.module] = bump[r.module] ?? nextSeq(r.module); r.seq = bump[r.module]++; }
  await DB.putMany('records', out);
  R.push(...out);
  await logEvent('import', `${n} entries from ${[...new Set(ui.importPlan.map(x => x.file))].join(', ')}`);
  requestPersist();
  ui.importPlan = null;
  toast(`Imported ${n} entries`);
  render();
}

async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return true;
}
const bufToB64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

async function backup() {
  const atts = await DB.all('attachments');
  const obj = {
    app: 'custody-record', format: 1, version: APP_VERSION, exportedAt: new Date().toISOString(),
    settings: { ...S, pinHash: '' }, records: R, events: await DB.all('events'),
    attachments: atts.map(a => ({ ...a, data: bufToB64(a.data) })),
  };
  const ok = await shareOrDownload(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `${S.child || 'custody'}-record-backup-${todayISO()}.json`);
  if (!ok) return;
  S.lastBackup = Date.now();
  await saveSettings();
  await logEvent('backup', `${R.length} entries, ${atts.length} files`);
  toast('Backup created');
  render();
}

async function restore(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { return toast('That file is not a backup.'); }
  if (obj.app !== 'custody-record') return toast('That file is not a Custody Record backup.');
  if (!confirm(`Restore backup from ${fmtStamp(Date.parse(obj.exportedAt))} (${obj.records.length} entries)?\n\nEntries missing here, or newer in the backup, are added. Nothing on this iPad is deleted.`)) return;
  const add = obj.records.filter(r => { const cur = getRec(r.id); return !cur || r.updatedAt > cur.updatedAt; });
  await DB.putMany('records', add);
  add.forEach(r => { const i = R.findIndex(x => x.id === r.id); if (i >= 0) R[i] = r; else R.push(r); });
  const have = new Set((await DB.all('attachments')).map(a => a.id));
  await DB.putMany('attachments', obj.attachments.filter(a => !have.has(a.id)).map(a => ({ ...a, data: b64ToBuf(a.data) })));
  const keepPin = S.pinHash;
  S = { ...structuredClone(DEFAULT_SETTINGS), ...obj.settings, pinHash: keepPin, lastBackup: S.lastBackup };
  await saveSettings();
  await logEvent('restore', `${add.length} entries restored from backup dated ${obj.exportedAt}`);
  toast(`Restored ${add.length} entries`);
  render();
}

/* ---------------- lock ---------------- */
const pinHash = pin => sha256Hex('custody-record:' + pin);
function showLock() {
  if (!S.pinHash) return;
  ui.locked = true;
  $('#lock').hidden = false;
  $('#lockpin').value = '';
  $('#lockmsg').textContent = '';
  setTimeout(() => $('#lockpin').focus(), 50);
}

/* ---------------- routing & render ---------------- */
function notFound() { return `<div class="empty">That entry was not found. <a href="#/home">Go home</a></div>`; }

function render() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  let html = '', active = parts[0];
  if (parts[0] === 'm' && SCHEMA[parts[1]]) {
    const [, m, id, sub] = parts;
    active = m;
    if (!id) html = viewList(m);
    else if (id === 'new') html = viewForm(m, null);
    else if (sub === 'edit') html = viewForm(m, id);
    else html = viewDetail(m, id);
  } else {
    html = ({ home: viewHome, analysis: viewAnalysis, reports: viewReports, report: viewReport, settings: viewSettings, deleted: viewDeleted }[parts[0]] || viewHome)();
    if (parts[0] === 'report') active = 'reports';
    if (parts[0] === 'deleted') active = 'settings';
  }
  $('#nav').innerHTML = navHTML(active);
  $('#main').innerHTML = html;
  if (render.last !== location.hash) { window.scrollTo(0, 0); render.last = location.hash; }
  fillAttachments();
  if (parts[0] === 'settings') fillSettingsExtras();
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'delete') {
    const rec = getRec(id);
    const reason = prompt(`Delete ${refNo(rec)}? It will be hidden from lists and reports but kept under Settings › Deleted entries.\n\nReason (optional):`, '');
    if (reason === null) return;
    rec.deleted = true; rec.deletedAt = Date.now(); rec.deleteReason = reason;
    rec.history.push({ at: Date.now(), action: 'deleted', note: reason ? `Reason: ${reason}` : '' });
    await DB.put('records', rec);
    toast(`${refNo(rec)} deleted`);
    location.hash = `#/m/${rec.module}`;
  } else if (act === 'undelete') {
    const rec = getRec(id);
    rec.deleted = false;
    rec.history.push({ at: Date.now(), action: 'restored' });
    await DB.put('records', rec);
    toast(`${refNo(rec)} restored`);
    render();
  } else if (act === 'rm-att') {
    if (!confirm('Remove this file from the entry? The removal is recorded in the entry history.')) return;
    const att = await DB.get('attachments', id), rec = getRec(b.dataset.rec);
    att.removed = Date.now();
    await DB.put('attachments', att);
    rec.history.push({ at: Date.now(), action: 'file removed', note: att.name });
    rec.updatedAt = Date.now();
    await DB.put('records', rec);
    render();
  } else if (act === 'backup') backup();
  else if (act === 'print') window.print();
  else if (act === 'csv') {
    const m = b.dataset.m;
    const ok = await shareOrDownload(new Blob([csvFor(m)], { type: 'text/csv' }), `${S.child}-${m}-${todayISO()}.csv`);
    if (ok) logEvent('export', `${SCHEMA[m].label} CSV`);
  } else if (act === 'import-go') runImport();
  else if (act === 'import-cancel') { ui.importPlan = null; render(); }
  else if (act === 'pin-set') {
    const p1 = prompt('Choose a passcode (at least 4 characters):');
    if (!p1) return;
    if (p1.length < 4) return toast('Passcode must be at least 4 characters.');
    if (prompt('Enter it again to confirm:') !== p1) return toast('Passcodes did not match.');
    S.pinHash = await pinHash(p1);
    await saveSettings();
    toast('Passcode set');
    render();
  } else if (act === 'pin-clear') {
    if (!confirm('Remove the passcode?')) return;
    S.pinHash = '';
    await saveSettings();
    render();
  }
});

document.addEventListener('input', e => {
  const m = e.target.dataset.search;
  if (!m) return;
  ui.search[m] = e.target.value;
  const { rows, html } = listItems(m);
  $('#list').innerHTML = html;
  $('#count').textContent = plural(rows.length, 'entry').replace('entrys', 'entries');
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.range) {
    ui.range = { ...ui.range, [t.dataset.range]: t.value };
    if (t.value === 'custom' && !ui.range.from) Object.assign(ui.range, bounds({ preset: '90' }));
    render();
  } else if (t.dataset.filter) {
    ui.filter[t.dataset.filter] = t.value;
    render();
  } else if (t.dataset.file === 'import' && t.files.length) {
    $('#importplan').innerHTML = '<span class="muted">Reading…</span>';
    await planImport([...t.files]);
    t.value = '';
    $('#importplan').innerHTML = importPlanHTML();
  } else if (t.dataset.file === 'restore' && t.files[0]) {
    await restore(t.files[0]);
    t.value = '';
  } else if (t.dataset.file === 'attach' && t.files.length) {
    await addAttachments(t.dataset.id, [...t.files]);
  } else if (t.name === 'type' && t.form?.id === 'recform') {
    const d = S.schedDefaults[t.value];
    if (!d) return;
    const f = t.form;
    if (!f.schedPickup.value) f.schedPickup.value = d[0];
    if (!f.schedReturn.value) f.schedReturn.value = d[1];
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'recform') {
    const m = f.dataset.module;
    const data = {};
    const rec = f.dataset.id ? getRec(f.dataset.id) : null;
    for (const fld of SCHEMA[m].fields) {
      let v = (f.elements[fld.k]?.value || '').trim();
      // keep a non-time value from an import (e.g. "Missed") unless the user picked a time
      if (fld.t === 'time' && !v && rec && rec.data[fld.k] && toMin(rec.data[fld.k]) == null) v = rec.data[fld.k];
      if (v) data[fld.k] = v;
    }
    const saved = await saveRecord(m, f.dataset.id || null, data);
    toast(`${refNo(saved)} saved`);
    location.hash = `#/m/${m}/${saved.id}`;
  } else if (f.id === 'settingsform') {
    const v = k => f.elements[k].value.trim();
    Object.assign(S, { child: v('child'), me: v('me'), other: v('other'), otherRole: v('otherRole'), preparedBy: v('preparedBy'), graceMin: +v('graceMin') || 0 });
    S.schedDefaults = { 'Thursday possession': [v('thuP'), v('thuR')], 'Weekend possession': [v('wkP'), v('wkR')] };
    await saveSettings();
    await logEvent('settings', 'Names / schedule updated');
    toast('Settings saved');
    render();
  } else if (f.id === 'reportform') {
    const o = { title: f.elements.title.value.trim() || 'Record' };
    ['summary', ...MODULES, 'omitPrivate', 'history', 'photos'].forEach(k => (o[k] = f.elements[k].checked));
    if (f.elements.preparedBy.value.trim() !== S.preparedBy) { S.preparedBy = f.elements.preparedBy.value.trim(); await saveSettings(); }
    ui.report = o;
    location.hash = '#/report';
  } else if (f.id === 'lockform') {
    if (await pinHash($('#lockpin').value) === S.pinHash) { ui.locked = false; $('#lock').hidden = true; }
    else $('#lockmsg').textContent = 'Incorrect passcode.';
  }
});

// chart tooltips (hover with a mouse, tap on iPad)
const tip = () => $('#tip');
function showTip(el, x, y) {
  const t = tip();
  t.textContent = el.dataset.tip;
  t.hidden = false;
  const w = t.offsetWidth;
  t.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
  t.style.top = Math.max(8, y - 44) + 'px';
}
document.addEventListener('pointerover', e => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
document.addEventListener('pointermove', e => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) tip().hidden = true; });
document.addEventListener('pointerdown', e => { if (!e.target.closest?.('[data-tip]')) tip().hidden = true; });

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.pinHash) showLock(); });
window.addEventListener('hashchange', render);

/* ---------------- start ---------------- */
(async function start() {
  try {
    await DB.open();
    const s = await DB.get('meta', 'settings');
    if (s) S = { ...structuredClone(DEFAULT_SETTINGS), ...s.value };
    R = await DB.all('records');
  } catch (e) {
    $('#main').innerHTML = `<div class="empty">This browser could not open local storage (${esc(e.message)}). Private browsing mode blocks storage.</div>`;
    return;
  }
  if (S.pinHash) showLock();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
