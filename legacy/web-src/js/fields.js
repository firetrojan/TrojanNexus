// fields.js - the extra facts each kind of resource carries (cost, free limit, handle ...) plus the fields you add yourself.
// Pure data and checks. No DOM here, so it behaves the same in a browser and in tests.
import { parseISO } from './util.js';

const TOOLISH = ['web-tool', 'ai-source', 'article-site', 'catalogue', 'docs', 'other'];

/** Built-in fields. `types: null` = every type. kind: 'choice' | 'text' | 'date'. */
export const BUILTIN = [
  { key: 'cost', label: 'Cost', kind: 'choice', options: ['Free', 'Free with limits', 'Paid', 'Unknown'], types: null },
  { key: 'login', label: 'Login needed', kind: 'choice', options: ['No', 'Yes', 'Not sure'], types: TOOLISH },
  { key: 'device', label: 'Works on', kind: 'choice', options: ['Phone', 'Computer', 'Both'], types: ['web-tool', 'ai-source'] },
  { key: 'limit', label: 'Free limit', kind: 'text', ph: 'e.g. 1.3M tokens free', types: ['ai-source', 'web-tool'] },
  { key: 'resets', label: 'Limit resets or offer ends', kind: 'date', types: ['ai-source', 'web-tool'] },
  { key: 'models', label: 'Models or features you use', kind: 'text', ph: 'e.g. DeepSeek, GLM', types: ['ai-source'] },
  { key: 'handle', label: 'Handle or channel name', kind: 'text', ph: '@name', types: ['social', 'youtube-channel', 'community'] },
  { key: 'purpose', label: 'What you use it for', kind: 'choice', options: ['Reminders', 'Opportunities', 'Learning', 'Inspiration', 'News'], types: ['social'] },
  { key: 'platform', label: 'Platform', kind: 'choice', options: ['Discord', 'WhatsApp', 'Telegram', 'Slack', 'Forum', 'Other'], types: ['community'] },
  { key: 'askFor', label: 'Ask here about', kind: 'text', ph: 'e.g. scholarships, maths help', types: ['community'] },
  { key: 'focus', label: 'Watch it for', kind: 'text', ph: 'e.g. study methods', types: ['youtube-channel'] },
  { key: 'watch', label: 'How often you watch', kind: 'choice', options: ['Daily', 'Weekly', 'When needed'], types: ['youtube-channel'] }
];
export const BUILTIN_BY_KEY = Object.fromEntries(BUILTIN.map(d => [d.key, d]));
export const CUSTOM_KINDS = ['text', 'choice', 'date'];
export const KIND_LABEL = { text: 'Text', choice: 'Choice', date: 'Date' };
const KEY_RX = /^[a-zA-Z][A-Za-z0-9_]{0,24}$/;

/** Key for a field you add: c_ plus the label in lower case letters and digits. */
export const keyFor = label => 'c_' + String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);

/** Clean the list of your own fields. Drops anything malformed, never throws. */
export function normCustom(list, validTypes) {
  const out = [], seen = new Set(BUILTIN.map(d => d.key));
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x !== 'object') continue;
    const label = String(x.label || '').trim().slice(0, 30); if (!label) continue;
    if (BUILTIN.some(d => d.label.toLowerCase() === label.toLowerCase()) || out.some(d => d.label.toLowerCase() === label.toLowerCase())) continue;   // same name as a field that already exists
    let key = String(x.key || '').trim(); if (!/^c_[a-z0-9_]{1,22}$/.test(key)) key = keyFor(label);
    if (key === 'c_' || seen.has(key)) continue;
    const kind = CUSTOM_KINDS.includes(x.kind) ? x.kind : 'text';
    const options = kind === 'choice' ? [...new Set((Array.isArray(x.options) ? x.options : String(x.options || '').split(',')).map(o => String(o).trim().slice(0, 24)).filter(Boolean))].slice(0, 12) : [];
    if (kind === 'choice' && !options.length) continue;
    const types = (Array.isArray(x.types) ? x.types : []).filter(t => !validTypes || validTypes.includes(t));
    seen.add(key); out.push({ key, label, kind, options, types });
    if (out.length >= 12) break;
  }
  return out;
}

/** The values stored on one resource. Keeps only short text under safe keys. A resets date must be a real date. */
export function normFields(f) {
  const out = {};
  if (!f || typeof f !== 'object' || Array.isArray(f)) return out;
  for (const k of Object.keys(f)) {
    if (!KEY_RX.test(k)) continue;
    const v = f[k]; if (typeof v !== 'string' && typeof v !== 'number') continue;
    const s = String(v).trim().slice(0, 200); if (!s) continue;
    if (k === 'resets' && !parseISO(s)) continue;
    out[k] = k === 'resets' ? s.slice(0, 10) : s;
  }
  return out;
}

/** Fields that apply to a type: the built-in ones for it, then your own that cover it. */
export const defsFor = (type, custom = []) => [...BUILTIN.filter(d => !d.types || d.types.includes(type)), ...custom.filter(d => !d.types.length || d.types.includes(type))];
export const allDefs = (custom = []) => [...BUILTIN, ...custom];
export const defOf = (key, custom = []) => BUILTIN_BY_KEY[key] || custom.find(d => d.key === key) || null;
export const labelOf = (key, custom = []) => { const d = defOf(key, custom); return d ? d.label : key; };

/** [{def, value}] for the fields that have a value, in a stable order. Also keeps values whose field no longer applies to the type. */
export function filled(r, custom = []) {
  const f = r.fields || {}, seen = new Set(), out = [];
  for (const d of defsFor(r.type, custom)) { seen.add(d.key); if (f[d.key]) out.push({ def: d, value: f[d.key] }); }
  for (const k of Object.keys(f)) if (!seen.has(k)) { const d = defOf(k, custom); if (d) out.push({ def: d, value: f[k] }); }
  return out;
}
/** One line of the facts, for lists and exports: "Free with limits · 1.3M tokens free". */
export const summaryOf = (r, custom = [], skip = []) => filled(r, custom).filter(x => !skip.includes(x.def.key)).map(x => x.value).join(' · ');
