// store.js - data model, saving, and every data operation. No DOM code here.
import { uid, todayISO, addDays, daysBetween, parseISO, emitter, uniq, normUrl } from './util.js';
import { pickSlot } from './layout3d.js';
import { normFields, normCustom } from './fields.js';
import { normRule, matches as ruleMatches } from './rules.js';
import { normWatch, compare as watchCompare } from './watch.js';
import { normHome, normShelves } from './home.js';
import { normRecent, pushVisit } from './recent.js';
import { normWeekly } from './week.js';
import { normLog, pushLog } from './history.js';
import { mergePatch } from './merge.js';
import { pushRecent } from './choices.js';

export const TYPES = ['web-tool', 'article-site', 'youtube-channel', 'ai-source', 'social', 'community', 'feed', 'catalogue', 'docs', 'other'];
/** Life of a resource: to try -> trial (testing) -> active -> archived (retired). */
export const STATUSES = ['candidate', 'testing', 'active', 'archived'];
export const STALE_CANDIDATE_DAYS = 30;
export const CADENCES = ['daily', 'weekly', 'monthly', 'none'];
export const CADENCE_DAYS = { daily: 1, weekly: 7, monthly: 30, none: 0 };
export const STORAGE_KEY = 'nexus.v1';
export const STALE_UNCHECKED_DAYS = 30;
export const STALE_TESTING_DAYS = 60;
export const SCHEMA = 1;
/** Star colours: the real spectral range (blue giant to red dwarf), then nebula tints. Planet colours: worlds, not suns. */
export const STAR_COLORS = ['#7FA2FF', '#A9C2FF', '#E3EBFF', '#FFF6E8', '#FFE066', '#FFB347', '#FF6B4A', '#FF7AC8', '#B58CFF', '#4DD9E8', '#5BE39A', '#FFC93C'];
export const PLANET_COLORS = ['#4F8CFF', '#34C759', '#FF9500', '#C8A27A', '#E5573F', '#B07CFF', '#6FD6E8', '#F4E3B5', '#FF6FB0', '#8E8E93', '#2FA39A', '#F2F2F7'];
export const JOB_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#FFCC00', '#32ADE6', '#FF3B30', '#00C7BE', '#5856D6', '#A2845E', '#8E8E93'];   // iOS system colours
export const DEFAULT_SETTINGS = { theme: 'auto', sound: false, quality: 'auto', intro: true, notify: false, tethers: true, space: true, calm: false, haptics: true, web: true, webMode: 'auto', webReader: '', webSkip: ['filen.io'], customFields: [], deletedKeys: [], startOn: 'home', home: null, activeMission: '', textSize: 'm', seenVersion: '', opensSince: '', weekly: null, dupeIgnore: [], recentJobs: [], recent: [], shelves: [], siteIcons: false, badge: true };

const bus = emitter();
export const on = bus.on;
export const emit = bus.emit;

export const state = { resources: [], jobs: [], threads: [], settings: { ...DEFAULT_SETTINGS }, game: {} };
export const meta = { persistent: true, firstRun: false, lastError: '' };
let idx = new Map();

// ---------- normalising ----------
const toLines = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean)
  : (typeof v === 'string' ? v.split(/\r?\n|;/).map(x => x.trim()).filter(Boolean) : []);
const toTags = v => uniq((Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,\n]/) : []))
  .map(x => String(x).trim().toLowerCase().replace(/^#/, '')).filter(Boolean));
const isoOr = v => (parseISO(v) ? String(v).slice(0, 10) : '');
/** What the last look at this item found. Small on purpose: when, how, topic, how sure, and the page's own one-line description. */
const normScan = s => (s && typeof s === 'object' && parseISO(s.at)) ? {
  at: isoOr(s.at), via: String(s.via || '').slice(0, 12), topic: String(s.topic || '').slice(0, 16), topic2: String(s.topic2 || '').slice(0, 16),
  conf: ['clear', 'maybe', 'none'].includes(s.conf) ? s.conf : 'none', basis: String(s.basis || '').slice(0, 8), desc: String(s.desc || '').slice(0, 300), site: String(s.site || '').slice(0, 80)
} : null;

/** The decision after a trial: keep or drop, when, and a short reason. */
const normVerdict = v => (v && typeof v === 'object' && ['keep', 'drop'].includes(v.result) && parseISO(v.at)) ? { at: isoOr(v.at), result: v.result, note: String(v.note || '').slice(0, 300) } : null;

/** YouTube channel feed from a /channel/UC... url or a bare channel id. Handles (@name) cannot be derived offline. */
export function deriveRssUrl(url, hint) {
  const text = String(url || '') + ' ' + String(hint || '');
  const m = /(?:channel\/|channel_id=|\b)(UC[\w-]{22})\b/.exec(text);
  return m ? 'https://www.youtube.com/feeds/videos.xml?channel_id=' + m[1] : '';
}

export function computeNextCheck(r, today = todayISO()) {
  const d = CADENCE_DAYS[r.checkCadence] || 0;
  if (!d) return '';
  return r.lastChecked ? addDays(r.lastChecked, d) : today;
}

export function normalizeResource(raw, today = todayISO()) {
  const r = raw || {};
  const created = isoOr(r.createdAt) || today;
  const out = {
    id: r.id ? String(r.id) : uid('r'),
    title: String(r.title || '').trim(),
    url: String(r.url || '').trim(),
    type: TYPES.includes(r.type) ? r.type : 'other',
    tags: toTags(r.tags),
    capabilities: toLines(r.capabilities),
    useWhen: toLines(r.useWhen),
    inputs: String(r.inputs || '').trim(),
    outputs: String(r.outputs || '').trim(),
    status: STATUSES.includes(r.status) ? r.status : 'active',
    checkCadence: CADENCES.includes(r.checkCadence) ? r.checkCadence : 'none',
    lastChecked: isoOr(r.lastChecked),
    nextCheck: isoOr(r.nextCheck),
    rssUrl: String(r.rssUrl || '').trim(),
    related: uniq((Array.isArray(r.related) ? r.related : []).map(String)),
    notes: String(r.notes || ''),
    draft: !!r.draft,
    src: r.src || 'user',
    research: r.research || 'user',
    folder: String(r.folder || ''),
    added: isoOr(r.added),
    createdAt: created,
    statusSince: isoOr(r.statusSince) || created,
    hidden: !!r.hidden,
    scan: normScan(r.scan),
    fields: normFields(r.fields),
    trialEnd: isoOr(r.trialEnd),
    verdict: normVerdict(r.verdict),
    watch: normWatch(r.watch),
    locked: !!r.locked,
    pinned: !!r.pinned,
    keep: !!r.keep,   // "I still use this": never offered for archiving
    learned: String(r.learned || '').slice(0, 800),   // what you learned from using it, in your words
    log: normLog(r.log),
    opens: Math.max(0, Math.min(1e6, Math.floor(+r.opens) || 0)),
    openedAt: Math.max(0, Math.floor(+r.openedAt) || 0)
  };
  if (!out.title) out.title = out.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') || 'Untitled';
  if (!out.rssUrl && out.type === 'youtube-channel') out.rssUrl = deriveRssUrl(out.url);
  if (out.checkCadence === 'none') out.nextCheck = '';
  else if (!out.nextCheck) out.nextCheck = computeNextCheck(out, today);
  return out;
}

const normalizeJob = (j, i) => ({
  id: j.id ? String(j.id) : uid('j'),
  name: String(j.name || 'Sector').trim(),
  color: /^#[0-9a-f]{6}$/i.test(j.color || '') ? j.color : JOB_COLORS[i % JOB_COLORS.length],
  planetColor: /^#[0-9a-f]{6}$/i.test(j.planetColor || '') ? j.planetColor : '',   // '' = same as the star
  icon: j.icon || 'star',
  members: Array.isArray(j.members) ? j.members.map(String) : [],
  slot: Number.isInteger(j.slot) ? j.slot : undefined,
  sealed: !!j.sealed,
  note: String(j.note || ''),
  rule: normRule(j.rule)   // null = you place the resources yourself; a rule = the sector fills itself
});
const normalizeThread = t => ({
  id: t.id ? String(t.id) : uid('t'),
  name: String(t.name || 'Mission').trim(),
  note: String(t.note || ''),
  lastDone: String(t.lastDone || ''),   // when a step was last ticked off, so Home can show the mission you are working on
  steps: (Array.isArray(t.steps) ? t.steps : [])
    .map(s => typeof s === 'string' ? { rid: s, note: '', done: false, doneAt: '' } : { rid: String((s && (s.rid || s.id)) || ''), note: String((s && s.note) || ''), done: !!(s && s.done), doneAt: String((s && s.doneAt) || '') })
    .filter(s => s.rid)
});

// ---------- derived info ----------
export function dueBucket(r, today = todayISO()) {
  if (r.status === 'archived' || r.checkCadence === 'none' || !r.nextCheck) return null;
  if (r.nextCheck < today) return 'overdue';
  if (r.nextCheck === today) return 'today';
  if (r.nextCheck <= addDays(today, 7)) return 'upcoming';
  return null;
}

/** null when fine, else {reasons:[{kind:'never'|'unchecked'|'testing', days}], days}. */
export function staleInfo(r, today = todayISO()) {
  if (r.status === 'archived') return null;
  if (r.status === 'candidate') {   // something you meant to try: nag only when it sits for a month
    const d = daysBetween(r.statusSince || r.createdAt, today);
    return d > STALE_CANDIDATE_DAYS ? { reasons: [{ kind: 'candidate', days: d }], days: d } : null;
  }
  const reasons = [];
  if (r.status === 'testing') {
    const d = daysBetween(r.statusSince || r.createdAt, today);
    if (d > STALE_TESTING_DAYS) reasons.push({ kind: 'testing', days: d });
  }
  const d2 = daysBetween(r.lastChecked || r.createdAt, today);
  if (d2 > STALE_UNCHECKED_DAYS) reasons.push({ kind: r.lastChecked ? 'unchecked' : 'never', days: d2 });
  return reasons.length ? { reasons, days: Math.max(...reasons.map(x => x.days)) } : null;
}

/** A trial with an end date: 'overdue' once it has passed (decide now), 'soon' in the last 3 days. */
export function trialBucket(r, today = todayISO()) {
  if (r.status !== 'testing' || !r.trialEnd) return null;
  const d = daysBetween(today, r.trialEnd);
  return d < 0 ? 'overdue' : (d <= 3 ? 'soon' : null);
}
/** A free limit that resets, or an offer that ends. 'past' for 3 days after the date, 'soon' in the next 7 days. */
export function resetBucket(r, today = todayISO()) {
  const x = r.fields && r.fields.resets;
  if (r.status === 'archived' || !x || !parseISO(x)) return null;
  const d = daysBetween(today, x);
  return d < -3 ? null : (d < 0 ? 'past' : (d <= 7 ? 'soon' : null));
}

/** A watched page that changed and you have not looked at yet. */
export const watchChanged = r => !!(r.watch && r.watch.on && r.watch.changed && r.status !== 'archived');
export function stats(today = todayISO()) {
  const s = { total: 0, active: 0, drafts: 0, overdue: 0, today: 0, upcoming: 0, due: 0, events: 0, changes: 0, attention: 0, stale: 0, mapped: 100 };
  for (const r of state.resources) {
    s.total++;
    if (r.status !== 'archived') s.active++;
    if (r.draft) s.drafts++;
    const b = dueBucket(r, today);
    if (b) s[b]++;
    if (staleInfo(r, today)) s.stale++;
    if (trialBucket(r, today) || resetBucket(r, today) === 'soon' || resetBucket(r, today) === 'past') s.events++;
    if (watchChanged(r)) s.changes++;
  }
  s.due = s.overdue + s.today;
  s.attention = s.due + s.events + s.changes;
  s.mapped = s.total ? Math.round(100 * (s.total - s.drafts) / s.total) : 100;
  return s;
}

// ---------- lookups ----------
export const byId = id => idx.get(id) || null;
export const jobById = id => state.jobs.find(j => j.id === id) || null;
export const jobsOf = rid => state.jobs.filter(j => j.members.includes(rid));
export const threadById = id => state.threads.find(t => t.id === id) || null;
export const threadsOf = rid => state.threads.filter(t => t.steps.some(s => s.rid === rid));
// ---------- links you deleted: a later import does not bring them back ----------
const MAX_DELETED = 3000;
const normKeys = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x).slice(-MAX_DELETED) : []);
let delSet = null;
const deletedSet = () => delSet || (delSet = new Set(state.settings.deletedKeys));
/** Was a link with this address deleted earlier? */
export const wasDeleted = url => !!url && deletedSet().has(normUrl(url));
export const deletedCount = () => state.settings.deletedKeys.length;
const rememberDeleted = urls => {
  const keys = urls.filter(Boolean).map(normUrl).filter(k => k && !deletedSet().has(k));
  if (!keys.length) return;
  state.settings.deletedKeys = normKeys(state.settings.deletedKeys.concat(keys)); delSet = null;
};
/** A link you add on purpose is no longer "deleted". */
const forgetDeleted = urls => {
  const gone = deletedSet(), keys = urls.filter(Boolean).map(normUrl).filter(k => gone.has(k)); if (!keys.length) return;
  const drop = new Set(keys); state.settings.deletedKeys = state.settings.deletedKeys.filter(k => !drop.has(k)); delSet = null;
};
export const clearDeleted = () => { state.settings.deletedKeys = []; delSet = null; save(); };
export const findByUrl = url => { const k = normUrl(url); return state.resources.find(r => r.url && normUrl(r.url) === k) || null; };
export const allTags = () => {
  const m = new Map();
  state.resources.forEach(r => r.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};
export const getSetting = k => state.settings[k];
/** Remember that you just put a link in this sector, so it is offered first next time. */
export function noteJobUsed(id) { if (jobById(id)) { state.settings.recentJobs = pushRecent(state.settings.recentJobs, id); save(); } }
/** Note that you looked at a link ('r'), sector ('s') or mission ('m'), for the Continue tile. Quiet: saves, redraws nothing. */
export function noteVisit(k, id) { state.settings.recent = pushVisit(state.settings.recent, k, id, Date.now()); save(); }
export function setSetting(k, v) { if (k === 'customFields') v = normCustom(v, TYPES); state.settings[k] = v; bus.emit('settings', { key: k, value: v }); save(); }

function reindex() { idx = new Map(state.resources.map(r => [r.id, r])); }
function changed(kind, ids) { refreshSmart(); bus.emit('change', { kind, ids: ids || [] }); save(); }
/** Tell the safety net to keep a copy of everything right now, just before something big changes. */
export const before = reason => bus.emit('before-bulk', reason);

// ---------- smart sectors: members come from the rule ----------
export const isSmart = j => !!(j && j.rule);
/** Recompute the members of every smart sector. Returns true when any of them changed. */
export function refreshSmart(today = todayISO()) {
  let any = false;
  for (const j of state.jobs) {
    if (!j.rule) continue;
    const ids = state.resources.filter(r => ruleMatches(r, j.rule, today)).map(r => r.id);
    if (ids.length !== j.members.length || ids.some((id, i) => id !== j.members[i])) { j.members = ids; any = true; }
  }
  return any;
}
export const customFields = () => (Array.isArray(state.settings.customFields) ? state.settings.customFields : []);

// ---------- saving and loading ----------
let timer = null;
function write() {
  timer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA, ...state }));
    meta.persistent = true; bus.emit('saved');
  } catch (e) {
    meta.persistent = false; meta.lastError = String((e && e.message) || e);
    bus.emit('persist-fail', meta.lastError);
  }
}
export function save(now) { clearTimeout(timer); if (now) write(); else timer = setTimeout(write, 150); }

function sanitize() {
  const ids = new Set(state.resources.map(r => r.id));
  state.resources.forEach(r => { r.related = r.related.filter(x => ids.has(x) && x !== r.id); });
  state.jobs.forEach(j => { j.members = uniq(j.members.filter(x => ids.has(x))); });
  state.threads.forEach(t => { t.steps = t.steps.filter(s => ids.has(s.rid)); });
  let slot = state.jobs.reduce((m, j) => Math.max(m, Number.isInteger(j.slot) ? j.slot : -1), -1);
  const used = new Set();
  state.jobs.forEach(j => { if (!Number.isInteger(j.slot) || used.has(j.slot)) j.slot = ++slot; used.add(j.slot); });
}

function applyData(d) {
  const today = todayISO(), seen = new Set();
  state.resources = (d.resources || []).map(r => normalizeResource(r, today)).filter(r => !seen.has(r.id) && seen.add(r.id));
  state.jobs = (d.jobs || []).map(normalizeJob);
  state.threads = (d.threads || []).map(normalizeThread);
  state.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  state.settings.customFields = normCustom(state.settings.customFields, TYPES);
  state.settings.deletedKeys = normKeys(state.settings.deletedKeys); delSet = null;
  state.settings.home = normHome(state.settings.home);
  if (state.settings.weekly) state.settings.weekly = normWeekly(state.settings.weekly);
  state.settings.siteIcons = state.settings.siteIcons === true; state.settings.badge = state.settings.badge !== false;
  state.settings.recent = normRecent(state.settings.recent); state.settings.shelves = normShelves(state.settings.shelves);
  state.settings.recentJobs = (Array.isArray(state.settings.recentJobs) ? state.settings.recentJobs : []).filter(x => typeof x === 'string').slice(0, 8);
  state.settings.dupeIgnore = (Array.isArray(state.settings.dupeIgnore) ? state.settings.dupeIgnore : []).filter(x => typeof x === 'string' && x).slice(-300);
  state.game = d.game && typeof d.game === 'object' ? d.game : {};
  reindex(); sanitize(); refreshSmart();
}

export function load(seed) {
  let data = null;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) data = JSON.parse(raw); } catch (e) { meta.persistent = false; }
  if (data && Array.isArray(data.resources)) { applyData(data); meta.firstRun = false; }
  else { applyData(seed || {}); meta.firstRun = true; save(true); }
  bus.emit('load');
  return meta;
}
export function resetToSeed(seed) { before('Before reset'); applyData(seed || {}); meta.firstRun = true; save(true); bus.emit('load'); changed('reset'); }

// ---------- resources ----------
export function addResource(partial = {}, jobIds = []) {
  const r = normalizeResource({ ...partial, id: partial.id || uid('r') }, todayISO());
  state.resources.push(r); idx.set(r.id, r); forgetDeleted([r.url]);
  jobIds.forEach(j => addToJob(j, r.id, true));
  changed('add', [r.id]);
  return r;
}

/** Add many parsed entries. Skips links already stored. Returns {added:[ids], skipped:n}. */
export function addMany(entries, jobIds = []) {
  if (entries.length > 1) before('Before an import');
  const keys = new Set(state.resources.filter(r => r.url).map(r => normUrl(r.url)));
  const added = []; let skipped = 0;
  for (const e of entries) {
    const k = e.url ? normUrl(e.url) : '';
    if (k && keys.has(k)) { skipped++; continue; }
    if (k) keys.add(k);
    const r = normalizeResource({ ...e, id: uid('r') }, todayISO());
    state.resources.push(r); idx.set(r.id, r); added.push(r.id); forgetDeleted([r.url]);
    jobIds.forEach(j => addToJob(j, r.id, true));
  }
  if (added.length) changed('add', added);
  return { added, skipped };
}

const STAGE = { candidate: 'To try', testing: 'Trial', active: 'Active', archived: 'Archived' };
export function updateResource(id, patch, silent) {
  const r = byId(id); if (!r) return null;
  const next = normalizeResource({ ...r, ...patch, id: r.id }, todayISO());
  if (!('nextCheck' in patch) && ('checkCadence' in patch || 'lastChecked' in patch)) next.nextCheck = computeNextCheck(next);
  const today = todayISO(), ev = [];
  if (patch.status && patch.status !== r.status) next.statusSince = today;
  if (r.draft && !next.draft) ev.push(['reviewed', 'Marked as reviewed']);
  if (next.status !== r.status) ev.push(['status', STAGE[r.status] + ' to ' + STAGE[next.status]]);
  if (next.learned !== r.learned && next.learned) ev.push(['learned', r.learned ? 'Updated what I learned' : 'Wrote what I learned']);
  if (ev.length) next.log = pushLog(next.log, ev, today);
  Object.assign(r, next);
  if (!silent) changed('update', [id]);
  return r;
}

/** Change many at once. Locked resources are skipped unless o.includeLocked. Returns { changed, skipped }. */
export function bulkUpdate(ids, patchFn, o = {}) {
  const open = id => { const r = byId(id); return r && (o.includeLocked || !r.locked); };   // includeLocked: for harmless fills (reading a page, confirming a review)
  const todo = ids.filter(open), skipped = ids.filter(id => byId(id) && !open(id)).length;
  if (todo.length > 1 || o.reason) before(o.reason || 'Before a bulk change');   // o.reason: always save a copy, under a name Undo can find
  todo.forEach(id => { const r = byId(id); if (r) updateResource(id, patchFn(r), true); });
  changed('update', todo);
  return { changed: todo.length, skipped };
}

export function deleteResource(id) {
  if (!byId(id) || byId(id).locked) return false;
  before('Before a delete'); rememberDeleted([byId(id).url]);
  state.resources = state.resources.filter(r => r.id !== id);
  state.resources.forEach(r => { r.related = r.related.filter(x => x !== id); });
  state.jobs.forEach(j => { j.members = j.members.filter(x => x !== id); });
  state.threads.forEach(t => { t.steps = t.steps.filter(s => s.rid !== id); });
  reindex();
  changed('delete', [id]);
  return true;
}

/** Delete several at once (one safety copy). Locked ones stay. Returns { deleted, skipped }. */
export function deleteMany(ids) {
  const gone = new Set(ids.filter(id => byId(id) && !byId(id).locked)), skipped = ids.filter(id => byId(id) && byId(id).locked).length;
  if (!gone.size) return { deleted: 0, skipped };
  before('Before deleting several'); rememberDeleted([...gone].map(id => byId(id).url));
  state.resources = state.resources.filter(r => !gone.has(r.id));
  state.resources.forEach(r => { r.related = r.related.filter(x => !gone.has(x)); });
  state.jobs.forEach(j => { j.members = j.members.filter(x => !gone.has(x)); });
  state.threads.forEach(t => { t.steps = t.steps.filter(s => !gone.has(s.rid)); });
  reindex(); changed('delete', [...gone]);
  return { deleted: gone.size, skipped };
}

/**
 * Join two links about the same thing: `drop` is removed, `keep` gets its tags, notes, uses and details, and every sector,
 * mission step, link and weekly pick that pointed at `drop` now points at `keep`. A safety copy is saved first.
 * Returns { keep, moved: { tags, sectors, steps } } or null (same link, missing, or the one to remove is locked).
 */
export function mergeResources(keepId, dropId, o = {}) {
  const keep = byId(keepId), drop = byId(dropId);
  if (!keep || !drop || keepId === dropId || drop.locked) return null;
  if (!o.quiet) before('Before merging links');   // quiet: the caller already saved one safety copy for a whole batch
  const today = todayISO(), patch = mergePatch(keep, drop), moved = { tags: patch.tags.length - keep.tags.length, sectors: 0, steps: 0 };
  updateResource(keepId, { ...patch, log: pushLog(keep.log, [['merged', 'Merged in "' + drop.title.slice(0, 60) + '"']], today) }, true);
  for (const j of state.jobs) {
    if (j.rule || !j.members.includes(dropId)) continue;
    j.members = uniq(j.members.map(x => (x === dropId ? keepId : x))); moved.sectors++;
  }
  for (const t of state.threads) {
    const seen = new Map(), steps = [];
    for (const st of t.steps) {
      const rid = st.rid === dropId ? keepId : st.rid;
      if (st.rid === dropId) moved.steps++;
      if (seen.has(rid)) { const first = seen.get(rid); if (st.done && !first.done) { first.done = true; first.doneAt = st.doneAt; } continue; }
      const x = { ...st, rid }; seen.set(rid, x); steps.push(x);
    }
    t.steps = steps;
  }
  state.resources.forEach(r => { if (r.related.includes(dropId)) r.related = uniq(r.related.map(x => (x === dropId ? keepId : x))).filter(x => x !== r.id); });
  const w = state.settings.weekly;
  if (w && Array.isArray(w.picks)) { const seen = new Set(); w.picks = w.picks.map(p => (p.rid === dropId ? { ...p, rid: keepId } : p)).filter(p => !seen.has(p.rid) && seen.add(p.rid)); }
  if (!byId(keepId).url || normUrl(drop.url) !== normUrl(byId(keepId).url)) rememberDeleted([drop.url]);   // a repeat of the same address is not "deleted": the survivor still has it
  state.resources = state.resources.filter(r => r.id !== dropId); reindex();
  changed('merge', [keepId, dropId]);
  return { keep: byId(keepId), moved };
}

export function duplicateResource(id) {
  const r = byId(id); if (!r) return null;
  return addResource({ ...r, id: undefined, title: r.title + ' (copy)', lastChecked: '', nextCheck: '', related: [], draft: true }, jobsOf(id).map(j => j.id));
}

/** Count one open of a resource's link (for the Home launch pad). Quiet: it saves but does not redraw anything. */
export function markOpened(id) {
  const r = byId(id); if (!r) return null;
  r.opens = Math.min(1e6, (r.opens || 0) + 1); r.openedAt = Date.now();
  if (!state.settings.opensSince) state.settings.opensSince = todayISO();   // when Nexus started counting, so "not opened for 60 days" can be trusted
  save();
  return r;
}
export const setPinned = (id, v) => updateResource(id, { pinned: !!v });

export function markChecked(id) {
  const r = byId(id); if (!r) return null;
  r.lastChecked = todayISO(); r.nextCheck = computeNextCheck(r);
  r.log = pushLog(r.log, [['checked', 'Checked it still works']], r.lastChecked);
  changed('check', [id]); return r;
}
export function snooze(id, days) {
  const r = byId(id); if (!r || r.checkCadence === 'none') return null;
  r.nextCheck = addDays(todayISO(), days);
  changed('snooze', [id]); return r;
}

// ---------- life of a resource: trial and verdict ----------
export function startTrial(id, days = 14) {
  const r = byId(id); if (!r) return null;
  const today = todayISO();
  Object.assign(r, { status: 'testing', statusSince: today, trialEnd: addDays(today, Math.max(1, days)), verdict: null });
  r.log = pushLog(r.log, [['status', 'Trial started, ends ' + r.trialEnd]], today);
  changed('update', [id]); return r;
}
export function extendTrial(id, days) {
  const r = byId(id); if (!r || r.status !== 'testing') return null;
  const base = r.trialEnd && r.trialEnd > todayISO() ? r.trialEnd : todayISO();
  r.trialEnd = addDays(base, Math.max(1, days)); changed('update', [id]); return r;
}
/** Decide after a trial: 'keep' makes it active, 'drop' archives it. The decision and a short note are kept on the resource. */
export function setVerdict(id, result, note = '') {
  const r = byId(id); if (!r || !['keep', 'drop'].includes(result)) return null;
  const today = todayISO();
  Object.assign(r, { status: result === 'keep' ? 'active' : 'archived', statusSince: today, trialEnd: '', verdict: { at: today, result, note: String(note || '').slice(0, 300) } });
  r.log = pushLog(r.log, [['verdict', result === 'keep' ? 'Decided to keep it' : 'Decided to drop it']], today);
  changed('update', [id]); return r;
}
/** Is it time to remind you to download a backup? Nags only when there is something worth saving and the last backup is a week old (or never). */
export function backupNudge(today = todayISO()) {
  const n = state.resources.length, last = state.game && state.game.lastBackup, snooze = state.settings.backupSnooze;
  const days = last && parseISO(last) ? daysBetween(last, today) : null;
  const later = !!(snooze && parseISO(snooze) && snooze > today);
  return { due: n >= 10 && (days === null || days >= 7) && !later, days, n };
}

// ---------- watching a page for changes, and locking ----------
/** Start or stop watching. Starting keeps no baseline yet: the first check saves one. */
export function setWatch(id, on) {
  const r = byId(id); if (!r) return null;
  r.watch = on ? (r.watch || { on: true, at: '', fp: null, changed: '', what: [] }) : null;
  changed('update', [id]); return r;
}
/** Store the result of one check. Returns 'baseline' (first look), 'same', 'changed' or 'unreadable'. */
export function recordWatch(id, fp, today = todayISO()) {
  const r = byId(id); if (!r || !r.watch) return null;
  const c = watchCompare(r.watch.fp, fp);
  if (c.unreadable) { r.watch.at = today; changed('update', [id]); return 'unreadable'; }
  let out = 'same';
  if (c.rebase || !r.watch.fp) out = 'baseline';
  else if (!c.same) { r.watch.changed = today; r.watch.what = c.what; out = 'changed'; }
  r.watch.fp = fp; r.watch.at = today;
  changed('update', [id]); return out;
}
export function markWatchSeen(id) { const r = byId(id); if (!r || !r.watch) return null; r.watch.changed = ''; r.watch.what = []; changed('update', [id]); return r; }
/** A locked resource is skipped by bulk changes and cannot be deleted until you unlock it. */
export function setLocked(id, on) { const r = byId(id); if (!r) return null; r.locked = !!on; changed('update', [id]); return r; }

/** Set one extra field (cost, limit, ...) without touching the others. */
export function setField(id, key, value) {
  const r = byId(id); if (!r) return null;
  return updateResource(id, { fields: { ...r.fields, [key]: value } });
}

export function link(a, b) {
  const A = byId(a), B = byId(b); if (!A || !B || a === b) return;
  if (!A.related.includes(b)) A.related.push(b);
  if (!B.related.includes(a)) B.related.push(a);
  changed('link', [a, b]);
}
export function unlink(a, b) {
  const A = byId(a), B = byId(b); if (!A || !B) return;
  A.related = A.related.filter(x => x !== b); B.related = B.related.filter(x => x !== a);
  changed('link', [a, b]);
}

// ---------- jobs (sectors) ----------
export function addJob({ name, color, planetColor, icon, sealed, rule } = {}) {
  const slot = pickSlot(state.jobs, 0);
  const j = { id: uid('j'), name: String(name || 'New sector').trim(), color: color || JOB_COLORS[slot % JOB_COLORS.length], planetColor: /^#[0-9a-f]{6}$/i.test(planetColor || '') ? planetColor : '', icon: icon || 'star', members: [], slot, sealed: !!sealed, note: '', rule: normRule(rule) };
  state.jobs.push(j); changed('job', []); return j;
}
/** The catch-all sector for new finds that were not given a sector. Created on first use. */
export function ensureInbox() {
  let j = state.jobs.find(x => x.name === 'Inbox');
  if (!j) { j = addJob({ name: 'Inbox', color: '#8da2c8' }); j.note = 'New finds waiting for a proper sector.'; }
  return j;
}
export function updateJob(id, patch) {
  const j = jobById(id); if (!j) return null;
  if ('rule' in patch) j.rule = normRule(patch.rule);   // null turns a smart sector back into a manual one and keeps its members
  ['name', 'color', 'planetColor', 'icon', 'sealed', 'note'].forEach(k => { if (k in patch) j[k] = k === 'sealed' ? !!patch[k] : (k === 'planetColor' ? (/^#[0-9a-f]{6}$/i.test(patch[k] || '') ? patch[k] : '') : patch[k]); });
  changed('job', []); return j;
}
export function deleteJob(id) { before('Before deleting a sector'); state.jobs = state.jobs.filter(j => j.id !== id); changed('job', []); }
export function addToJob(jobId, rid, silent) {
  const j = jobById(jobId); if (!j || !byId(rid) || j.rule) return;   // a smart sector fills itself
  if (!j.members.includes(rid)) j.members.push(rid);
  if (!silent) changed('job', [rid]);
}
/** Put many links into sectors in one go: pairs = [[rid, jobId], ...]. One safety copy, one change event. Returns how many were placed. */
export function placeMany(pairs) {
  const todo = pairs.filter(([rid, jid]) => { const j = jobById(jid); return j && !j.rule && byId(rid) && !j.members.includes(rid); });
  if (!todo.length) return 0;
  if (todo.length > 1) before('Before auto-sort');
  todo.forEach(([rid, jid]) => jobById(jid).members.push(rid));
  changed('job', todo.map(x => x[0])); return todo.length;
}
/** A new sector holding these links, made in one step. One safety copy first (so Undo can put everything back). */
export function createSector(name, ids, color) {
  before('Before creating a sector');
  const j = addJob({ name, color }), keep = [...new Set(ids)].filter(id => byId(id));
  j.members = keep; changed('job', keep); return j;
}
export function removeFromJob(jobId, rid, silent) {
  const j = jobById(jobId); if (!j || j.rule) return;
  j.members = j.members.filter(x => x !== rid);
  if (!silent) changed('job', [rid]);
}
export function moveToJob(fromId, toId, rid) { if (isSmart(jobById(toId))) return; removeFromJob(fromId, rid, true); addToJob(toId, rid, true); changed('job', [rid]); }

// ---------- threads (missions) ----------
export function addThread(name, steps = []) {
  const t = normalizeThread({ name: name || 'New mission', steps });
  state.threads.push(t); sanitize(); changed('thread', []); return t;
}
export function renameThread(id, name) { const t = threadById(id); if (t) { t.name = String(name).trim() || t.name; changed('thread', []); } }
export function deleteThread(id) { state.threads = state.threads.filter(t => t.id !== id); changed('thread', []); }
export function addStep(tid, rid, note = '') { const t = threadById(tid); if (t && byId(rid)) { t.steps.push({ rid, note, done: false, doneAt: '' }); changed('thread', [rid]); } }
export function removeStep(tid, i) { const t = threadById(tid); if (t && t.steps[i]) { t.steps.splice(i, 1); changed('thread', []); } }
export function moveStep(tid, i, dir) {
  const t = threadById(tid); if (!t) return;
  const j = i + dir; if (j < 0 || j >= t.steps.length || !t.steps[i]) return;
  [t.steps[i], t.steps[j]] = [t.steps[j], t.steps[i]];
  changed('thread', []);
}
/** Tick a step off (or back on). Remembers when, so Home can show the mission you worked on last. */
export function setStepDone(tid, i, v = true) {
  const t = threadById(tid), st = t && t.steps[i]; if (!st) return false;
  st.done = !!v; st.doneAt = v ? new Date().toISOString() : '';
  if (v) t.lastDone = st.doneAt;
  changed('thread', []); return true;
}
/** Start a mission over: every step back to not done. */
export function resetThread(tid) { const t = threadById(tid); if (t) { t.steps.forEach(s => { s.done = false; s.doneAt = ''; }); changed('thread', []); } }
export function setStepNote(tid, i, note) { const t = threadById(tid); if (t && t.steps[i]) { t.steps[i].note = note; save(); } }

// ---------- backup ----------
export function exportData() {
  return { app: 'nexus', schema: SCHEMA, exportedAt: new Date().toISOString(), resources: state.resources, jobs: state.jobs, threads: state.threads, settings: state.settings, game: state.game };
}

/** Look inside a parsed JSON value before importing. */
export function previewBackup(obj) {
  const res = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.resources) ? obj.resources : null);
  if (!res) return { ok: false, error: 'No resources array found in this JSON.' };
  return { ok: true, resources: res.length, jobs: (obj.jobs || []).length || 0, threads: (obj.threads || []).length || 0, full: !Array.isArray(obj) };
}

/** mode 'replace' swaps everything; 'merge' adds what is missing (same id or same link is skipped). */
export function importBackup(obj, mode = 'merge') {
  const pv = previewBackup(obj); if (!pv.ok) throw new Error(pv.error);
  before(mode === 'replace' ? 'Before restoring a backup' : 'Before merging a backup');
  const data = Array.isArray(obj) ? { resources: obj } : obj;
  if (mode === 'replace') { applyData(data); changed('import'); return { added: state.resources.length, skipped: 0 }; }
  const today = todayISO(), keys = new Set(state.resources.filter(r => r.url).map(r => normUrl(r.url)));
  const added = []; let skipped = 0;
  for (const raw of data.resources) {
    const r = normalizeResource(raw, today);
    if (byId(r.id) || (r.url && keys.has(normUrl(r.url)))) { skipped++; continue; }
    if (r.url) keys.add(normUrl(r.url));
    state.resources.push(r); idx.set(r.id, r); added.push(r.id);
  }
  (data.jobs || []).map(normalizeJob).forEach((j, i) => {
    const ex = jobById(j.id) || state.jobs.find(x => x.name.toLowerCase() === j.name.toLowerCase());
    if (ex) j.members.forEach(m => { if (byId(m) && !ex.members.includes(m)) ex.members.push(m); });
    else state.jobs.push(j);
  });
  (data.threads || []).map(normalizeThread).forEach(t => { if (!threadById(t.id)) state.threads.push(t); });
  sanitize(); changed('import', added);
  return { added: added.length, skipped };
}
