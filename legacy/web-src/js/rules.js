// rules.js - smart sectors: a sector that fills itself from a rule such as "type is AI and cost is not Paid".
// Pure functions. The store keeps smart sectors up to date; the screens only read the rule and describe it.
import { todayISO, addDays, daysBetween, parseISO } from './util.js';
import { BUILTIN, allDefs } from './fields.js';
import { TOPICS } from './topics.js';

export const OPS = {
  is: 'is', not: 'is not', contains: 'contains', has: 'has the tag', nohas: 'does not have the tag', filled: 'is filled in', empty: 'is empty',
  soon: 'is within the next (days) or has passed', older: 'not checked for more than (days)', yes: 'is yes', no: 'is no'
};
const BY_KIND = {
  choice: ['is', 'not', 'filled', 'empty'], text: ['contains', 'is', 'not', 'filled', 'empty'], tags: ['has', 'nohas'],
  date: ['soon', 'filled', 'empty'], age: ['older'], bool: ['yes', 'no']
};
const NEEDS_VALUE = new Set(['is', 'not', 'contains', 'has', 'nohas', 'soon', 'older']);
export const needsValue = op => NEEDS_VALUE.has(op);
export const opsFor = kind => BY_KIND[kind] || [];

/**
 * Everything a rule can look at. ctx = { types:[{v,l}], statuses:[{v,l}], cadences:[{v,l}], custom:[...] } (labels come from the screens).
 * Each: { key, label, kind, options?:[{v,l}] }
 */
export function ruleFields(ctx = {}) {
  const opt = a => (a || []).map(x => (typeof x === 'string' ? { v: x, l: x } : x));
  const out = [
    { key: 'type', label: 'Type', kind: 'choice', options: opt(ctx.types) },
    { key: 'status', label: 'Stage', kind: 'choice', options: opt(ctx.statuses) },
    { key: 'tag', label: 'Tag', kind: 'tags' },
    { key: 'topic', label: 'Topic (what it is about)', kind: 'choice', options: TOPICS.map(t => ({ v: t.id, l: t.label })) },
    { key: 'cadence', label: 'Check schedule', kind: 'choice', options: opt(ctx.cadences) },
    { key: 'draft', label: 'To review', kind: 'bool' },
    { key: 'text', label: 'Name, link or notes', kind: 'text' },
    { key: 'lastChecked', label: 'Last checked', kind: 'age' },
    { key: 'trialEnd', label: 'Trial ends', kind: 'date' }
  ];
  for (const d of allDefs(ctx.custom)) out.push({ key: d.key, label: d.label, kind: d.kind, options: d.kind === 'choice' ? opt(d.options) : undefined });
  return out;
}

const norm = s => String(s == null ? '' : s).trim().toLowerCase();

/** The value a condition looks at, in a plain form. */
function read(r, key, today) {
  switch (key) {
    case 'type': return r.type;
    case 'status': return r.status;
    case 'tag': return r.tags || [];
    case 'topic': return (r.scan && r.scan.topic) || '';
    case 'cadence': return r.checkCadence;
    case 'draft': return !!r.draft;
    case 'text': return [r.title, r.url, r.notes].join(' ');
    case 'lastChecked': return daysBetween(r.lastChecked || r.createdAt || today, today);
    case 'trialEnd': return r.trialEnd || '';
    default: return (r.fields && r.fields[key]) || '';
  }
}

export function condMatches(r, c, today = todayISO()) {
  const v = read(r, c.f, today), want = norm(c.v);
  switch (c.op) {
    case 'is': return norm(v) === want;
    case 'not': return norm(v) !== want;
    case 'contains': return want !== '' && norm(v).includes(want);
    case 'has': return Array.isArray(v) && v.some(t => norm(t) === want.replace(/^#/, ''));
    case 'nohas': return Array.isArray(v) && !v.some(t => norm(t) === want.replace(/^#/, ''));
    case 'filled': return norm(v) !== '';
    case 'empty': return norm(v) === '';
    case 'soon': { if (!v || !parseISO(v)) return false; const n = Math.max(0, parseInt(c.v, 10) || 0); return v <= addDays(today, n); }
    case 'older': return typeof v === 'number' && v > Math.max(0, parseInt(c.v, 10) || 0);
    case 'yes': return v === true;
    case 'no': return v === false;
    default: return false;
  }
}

/** Does this rule mention the Stage? If not, archived items are left out. */
export const mentionsStatus = rule => !!rule && rule.conds.some(c => c.f === 'status');

export function matches(r, rule, today = todayISO()) {
  if (!rule || !Array.isArray(rule.conds) || !rule.conds.length) return false;
  if (r.status === 'archived' && !mentionsStatus(rule)) return false;
  return rule.match === 'any' ? rule.conds.some(c => condMatches(r, c, today)) : rule.conds.every(c => condMatches(r, c, today));
}

/** Clean a rule from anywhere (a backup, a form). Returns null when it cannot be used. */
export function normRule(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.conds)) return null;
  const allowed = new Set(Object.keys(OPS)), conds = [];
  for (const c of x.conds) {
    if (!c || typeof c !== 'object') continue;
    const f = String(c.f || '').slice(0, 30), op = String(c.op || '');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(f) || !allowed.has(op)) continue;
    const v = String(c.v == null ? '' : c.v).trim().slice(0, 60);
    if (needsValue(op) && v === '') continue;
    conds.push({ f, op, v: needsValue(op) ? v : '' });
    if (conds.length >= 8) break;
  }
  return conds.length ? { match: x.match === 'any' ? 'any' : 'all', conds } : null;
}

const OPWORD = { is: 'is', not: 'is not', contains: 'contains', has: 'has tag', nohas: 'has no tag', filled: 'is filled in', empty: 'is empty', yes: 'is yes', no: 'is no' };
/** "Type is AI and Cost is not Paid" */
export function describeRule(rule, ctx = {}) {
  if (!rule || !rule.conds || !rule.conds.length) return 'No rule yet';
  const fields = new Map(ruleFields(ctx).map(f => [f.key, f]));
  const one = c => {
    const f = fields.get(c.f), label = f ? f.label : c.f;
    const shown = f && f.options ? ((f.options.find(o => o.v === c.v) || {}).l || c.v) : c.v;
    if (c.op === 'soon') return label + ' within ' + c.v + ' days or passed';
    if (c.op === 'older') return label + ' more than ' + c.v + ' days ago';
    return label + ' ' + OPWORD[c.op] + (needsValue(c.op) ? ' ' + shown : '');
  };
  return rule.conds.map(one).join(rule.match === 'any' ? ' or ' : ' and ');
}

/** Ready-made rules to start from. */
export const PRESETS = [
  { id: 'free-ai', label: 'Free AI sources', rule: { match: 'all', conds: [{ f: 'type', op: 'is', v: 'ai-source' }, { f: 'cost', op: 'not', v: 'Paid' }] } },
  { id: 'attention', label: 'Needs attention this week', rule: { match: 'any', conds: [{ f: 'resets', op: 'soon', v: '7' }, { f: 'trialEnd', op: 'soon', v: '7' }, { f: 'lastChecked', op: 'older', v: '60' }] } },
  { id: 'trials', label: 'Trials running', rule: { match: 'all', conds: [{ f: 'status', op: 'is', v: 'testing' }] } },
  { id: 'totry', label: 'Still to try', rule: { match: 'all', conds: [{ f: 'status', op: 'is', v: 'candidate' }] } },
  { id: 'ask', label: 'Places to ask people', rule: { match: 'all', conds: [{ f: 'type', op: 'is', v: 'community' }] } },
  { id: 'freephone', label: 'Free and works on a phone', rule: { match: 'all', conds: [{ f: 'cost', op: 'is', v: 'Free' }, { f: 'device', op: 'not', v: 'Computer' }] } }
];
export { BUILTIN };
