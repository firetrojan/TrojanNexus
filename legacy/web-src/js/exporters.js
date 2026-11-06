// exporters.js - turn your resources into text that other tools can use: a task for Super Productivity, Markdown notes, a CSV table,
// a short brief to paste into an AI chat, calendar files and links. Pure functions: no DOM, no network.
import { todayISO, addDays, domainOf, parseISO } from './util.js';
import { filled, allDefs } from './fields.js';

const TYPE_NAME = { 'web-tool': 'Tool', 'article-site': 'Articles', 'youtube-channel': 'YouTube', 'ai-source': 'AI', social: 'Social', community: 'Community', feed: 'Feed', catalogue: 'Catalogue', docs: 'Docs', other: 'Other' };
const STAGE_NAME = { candidate: 'To try', testing: 'Trial', active: 'Active', archived: 'Archived' };
export const typeName = t => TYPE_NAME[t] || t;
export const stageName = s => STAGE_NAME[s] || s;
const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const mdEsc = s => one(s).replace(/([\[\]\\])/g, '\\$1');

/** Resources in a sector (or all when no sector given), archived left out unless asked. */
export function pick(state, { jobId = '', ids = null, archived = false, following = true } = {}) {
  let list = state.resources.slice();
  if (ids) { const s = new Set(ids); list = list.filter(r => s.has(r.id)); }
  else if (jobId) { const j = state.jobs.find(x => x.id === jobId); const s = new Set(j ? j.members : []); list = list.filter(r => s.has(r.id)); }
  if (!archived) list = list.filter(r => r.status !== 'archived');
  if (!following) list = list.filter(r => r.src !== 'following');
  return list;
}

// ---------- a task for Super Productivity (or any to-do app) ----------
/**
 * One task: the first line is the title, the rest is a Markdown note with the resources to use and the steps.
 * items: resources. o: { title, steps:[string], goal }
 */
export function taskText(items, o = {}) {
  const list = Array.isArray(items) ? items : [items];
  const first = list[0];
  const title = one(o.title) || (first ? 'Use ' + first.title : 'Task');
  const lines = [title, ''];
  if (o.goal) lines.push('Goal: ' + one(o.goal), '');
  lines.push(list.length > 1 ? 'Use these:' : 'Use this:');
  for (const r of list) {
    const why = r.useWhen && r.useWhen[0] ? ' (' + one(r.useWhen[0]) + ')' : '';
    lines.push('- ' + (r.url ? '[' + mdEsc(r.title) + '](' + r.url + ')' : mdEsc(r.title)) + why);
  }
  if (o.steps && o.steps.length) { lines.push('', 'Steps:'); o.steps.forEach(s => lines.push('- [ ] ' + one(s))); }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** A mission as one task with a checklist, one line per step. */
export function missionTask(thread, byId) {
  const items = [], steps = [];
  for (const s of thread.steps) {
    const r = byId(s.rid); if (!r) continue;
    items.push(r);
    steps.push((s.done ? '(done) ' : '') + (s.note ? one(s.note) + ' - ' : 'Use ') + r.title + (r.url ? ' (' + r.url + ')' : ''));
  }
  return taskText(items, { title: thread.name, goal: thread.note, steps });
}

// ---------- Markdown notes ----------
export function markdownAll(state, o = {}) {
  const custom = o.custom || (state.settings && state.settings.customFields) || [];
  const out = ['# My resources', '', 'Exported from Nexus on ' + todayISO() + '.', ''];
  const inSector = new Set();
  const block = r => {
    const l = [];
    const bits = [typeName(r.type), r.status !== 'active' ? stageName(r.status) : '', ...filled(r, custom).map(x => x.value)].filter(Boolean);
    l.push('- ' + (r.url ? '[' + mdEsc(r.title) + '](' + r.url + ')' : '**' + mdEsc(r.title) + '**') + (bits.length ? ' - ' + bits.map(one).join(' · ') : ''));
    if (r.useWhen.length) l.push('  - Use it when: ' + r.useWhen.map(one).join('; '));
    if (r.capabilities.length) l.push('  - Can do: ' + r.capabilities.map(one).join('; '));
    if (r.inputs || r.outputs) l.push('  - In: ' + one(r.inputs) + (r.outputs ? ' / Out: ' + one(r.outputs) : ''));
    if (r.tags.length) l.push('  - Tags: ' + r.tags.map(t => '#' + t).join(' '));
    if (r.notes) l.push('  - Notes: ' + one(r.notes).slice(0, 400));
    if (r.verdict) l.push('  - Verdict: ' + r.verdict.result + ' on ' + r.verdict.at + (r.verdict.note ? ' - ' + one(r.verdict.note) : ''));
    return l.join('\n');
  };
  const byId = new Map(state.resources.map(r => [r.id, r]));
  for (const j of state.jobs) {
    const rs = j.members.map(id => byId.get(id)).filter(r => r && (o.archived || r.status !== 'archived') && (o.following !== false || r.src !== 'following'));
    if (!rs.length) continue;
    out.push('## ' + j.name, ''); if (j.note) out.push(one(j.note), '');
    rs.forEach(r => { out.push(block(r)); inSector.add(r.id); }); out.push('');
  }
  const rest = state.resources.filter(r => !inSector.has(r.id) && (o.archived || r.status !== 'archived') && (o.following !== false || r.src !== 'following'));
  if (rest.length) { out.push('## Not in a sector', ''); rest.forEach(r => out.push(block(r))); out.push(''); }
  if (state.threads && state.threads.length) {
    out.push('## Missions', '');
    for (const t of state.threads) { out.push('### ' + t.name); if (t.note) out.push(one(t.note)); t.steps.forEach((s, i) => { const r = byId.get(s.rid); if (r) out.push((i + 1) + '. ' + (s.done ? '[x] ' : '') + r.title + (s.note ? ' - ' + one(s.note) : '')); }); out.push(''); }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- CSV table ----------
/** A cell that starts with = + - @ would run as a formula in a spreadsheet: put a ' in front. */
const cell = v => {
  let t = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
export function csvAll(state, o = {}) {
  const custom = o.custom || (state.settings && state.settings.customFields) || [];
  const defs = allDefs(custom);
  const head = ['Title', 'Link', 'Type', 'Stage', 'Sectors', 'Tags', ...defs.map(d => d.label), 'Use it when', 'Can do', 'Notes', 'Last checked', 'Next check', 'Trial ends', 'Saved from'];
  const sectors = new Map(); state.jobs.forEach(j => j.members.forEach(m => { (sectors.get(m) || sectors.set(m, []).get(m)).push(j.name); }));
  const rows = pick(state, { archived: o.archived, following: o.following !== false }).map(r => [r.title, r.url, typeName(r.type), stageName(r.status), (sectors.get(r.id) || []).join('; '), r.tags.join('; '),
    ...defs.map(d => (r.fields || {})[d.key] || ''), r.useWhen.join('; '), r.capabilities.join('; '), one(r.notes).slice(0, 500), r.lastChecked, r.nextCheck, r.trialEnd, r.src]);
  return [head, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- a brief to paste into an AI chat ----------
export const estimateTokens = text => Math.ceil(String(text).length / 4);
/**
 * o: { jobId, detail: 'short' | 'full', maxChars, links:false, custom }
 * Items with a written "use it when" come first. Links are left out by default, so nothing private travels with it.
 */
export function aiBrief(state, o = {}) {
  const custom = o.custom || (state.settings && state.settings.customFields) || [];
  const full = o.detail === 'full', maxChars = o.maxChars || (full ? 24000 : 12000);
  let list = pick(state, { jobId: o.jobId || '', following: false });
  const score = r => (r.useWhen.length ? 2 : 0) + (r.capabilities.length ? 1 : 0) + (filled(r, custom).length ? 1 : 0) + (r.status === 'active' ? 0.5 : 0);
  list = list.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i).map(x => x.r);
  const head = [
    'These are my own resources: tools, sources, channels and communities I already use or plan to use.',
    'When I ask how to do a job, choose from this list first. Name the resource, say why it fits, and give the first steps.',
    'Respect the free limits and costs shown. If nothing here fits, say so, then suggest something outside the list.',
    ''
  ].join('\n');
  const line = r => {
    const facts = [typeName(r.type), r.status !== 'active' ? stageName(r.status) : '', ...filled(r, custom).map(x => (x.def.kind === 'date' ? x.def.label + ' ' + x.value : x.value))].filter(Boolean).join(', ');
    const bits = [];
    if (r.useWhen.length) bits.push('use when: ' + r.useWhen.slice(0, full ? 5 : 2).map(one).join('; '));
    if (r.capabilities.length) bits.push('can do: ' + r.capabilities.slice(0, full ? 6 : 2).map(one).join('; '));
    if (full && r.notes) bits.push('note: ' + one(r.notes).slice(0, 160));
    return '- ' + r.title + ' (' + facts + (o.links && r.url ? ', ' + r.url : (domainOf(r.url) ? ', ' + domainOf(r.url) : '')) + ')' + (bits.length ? ': ' + bits.join('. ') : '');
  };
  const lines = []; let size = head.length, cut = 0;
  for (const r of list) { const l = line(r); if (size + l.length + 1 > maxChars) { cut = list.length - lines.length; break; } lines.push(l); size += l.length + 1; }
  const tail = cut ? '\n(' + cut + ' more resources were left out to keep this short.)' : '';
  const text = head + lines.join('\n') + tail + '\n';
  return { text, count: lines.length, left: cut, tokens: estimateTokens(text) };
}

// ---------- calendar ----------
/** Dates worth putting in a calendar: next checks, limit resets, trial ends. */
export function upcomingEvents(resources, { from = todayISO(), days = 90 } = {}) {
  const to = addDays(from, days), out = [];
  const add = (r, kind, date, what) => { if (date && parseISO(date) && date >= from && date <= to) out.push({ rid: r.id, kind, date, title: what + ': ' + r.title, details: [r.useWhen[0] || '', r.url || ''].filter(Boolean).join('\n'), url: r.url || '' }); };
  for (const r of resources) {
    if (r.status === 'archived') continue;
    if (r.checkCadence !== 'none') add(r, 'check', r.nextCheck, 'Check');
    add(r, 'resets', r.fields && r.fields.resets, 'Limit resets or offer ends');
    if (r.status === 'testing') add(r, 'trial', r.trialEnd, 'Trial ends - keep or drop');
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
const icsEsc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const d8 = s => s.replace(/-/g, '');
/** Fold a line at 75 bytes the way calendar files require. */
function fold(line) {
  const enc = new TextEncoder(), out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length, limit = out.length ? 74 : 75;
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ' ' : '') + l).join('\r\n');
}
/** A calendar file of all-day events. Opens in any calendar app. */
export function icsFor(events, { now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexus//Resources//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    L.push('BEGIN:VEVENT', 'UID:nexus-' + e.rid + '-' + e.kind + '-' + d8(e.date) + '@nexus.local', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d8(e.date), 'DTEND;VALUE=DATE:' + d8(addDays(e.date, 1)),
      'SUMMARY:' + icsEsc(e.title), e.details ? 'DESCRIPTION:' + icsEsc(e.details) : '', e.url && /^https?:\/\//i.test(e.url) ? 'URL:' + e.url : '', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
/** A link that opens Google Calendar with the event filled in. */
export function gcalLink(e) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: d8(e.date) + '/' + d8(addDays(e.date, 1)), details: e.details || '' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
export const whatsappLink = text => 'https://wa.me/?text=' + encodeURIComponent(text);
/** mailto: links break when very long, so the body is cut. `cut` tells you it happened. */
export function mailtoLink(subject, text, max = 1800) {
  const cut = text.length > max, body = cut ? text.slice(0, max) + '\n...(cut, copy the full text instead)' : text;
  return { href: 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), cut };
}
