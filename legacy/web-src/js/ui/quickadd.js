// ui/quickadd.js - paste a link (or many) and launch it into the galaxy. Suggests a sector and links so it connects by itself.
import { h, domainOf, debounce, plural, shortUrl } from '../util.js';
import { siteIndex, sameSite } from '../dupes.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { parseAny, inferType, inferTags } from '../importers.js';
import { suggestLinks, suggestJobs } from '../search.js';
import { analyse as guessOf, lookupResource, buildPatch } from '../lookup.js';
import { topicChips, webSettings, webStatus } from './scan.js';
import { app, setHighlight } from './app.js';
import { openPanel, closePanel, getPanel, btn, chip, ico, toast, promptBox, monogram, TYPE_LABEL } from './kit.js';

let st = null;
export function openQuickAdd(o = {}) {
  st = { text: o.text || '', jobIds: new Set(o.jobId ? [o.jobId] : []), manual: !!o.jobId, rel: new Set(), relSeen: '' };
  const p = openPanel('quickadd', { kind: 'overlay', title: 'Add', live: false, render: build });
  if (p.ta && o.text) { p.ta.value = o.text; analyse(p); }
  if (p.ta && o.jobId) analyse(p);
  return p;
}

function build(p) {
  if (p._built) { analyse(p); return; }
  p._built = true;
  const ta = p.ta = h('textarea.ta.qa-ta', { rows: 3, placeholder: 'Paste a link, or a list of links', autocapitalize: 'off', spellcheck: 'false' }, st.text);
  const paste = btn('Paste', { cls: 'sm', icon: 'copy', onclick: async () => { try { ta.value = await navigator.clipboard.readText(); st.text = ta.value; analyse(p); } catch (e) { toast('Your browser blocked the clipboard. Long-press the box and choose Paste.', { icon: 'info' }); } } });
  p.live = h('div.qa-live');
  ta.addEventListener('input', debounce(() => { st.text = ta.value; analyse(p); }, 170));
  p.body.append(h('div.stack', h('div.field', h('label', 'Paste anything'), ta, h('div.row', paste, btn('Import files', { cls: 'sm', icon: 'upload', onclick: () => { closePanel('quickadd'); app.open.import(); } }))), p.live));
  analyse(p); setTimeout(() => ta.focus(), 300);
}

const sectorFor = (name, rx) => store.state.jobs.find(j => !j.rule && rx.test(j.name));
const inbox = () => store.ensureInbox();

function analyse(p) {
  const text = (st.text || '').trim();
  if (!text) return p.live.replaceChildren(h('div.hint', 'Paste a link and it guesses the type, tags and topic from the words in it, and suggests where it belongs. When you are online it also reads the page to improve the guess (the link goes to a reader service; switch this off in Profile). Bookmarks files and your Instagram list: tap Import files.'));
  const parsed = parseAny(text), seen = new Set(), entries = [];
  for (const e of parsed.entries) { const k = (e.url || '').replace(/\/+$/, '').toLowerCase(); if (e.url && !seen.has(k)) { seen.add(k); entries.push(e); } }
  if (parsed.format === 'backup') return p.live.replaceChildren(h('div.hint.warn', 'This looks like a full backup file. Use Import in the Profile screen to restore it.'), btn('Open Profile', { cls: 'sm', onclick: () => { closePanel('quickadd'); app.open.core(); } }));
  if (!entries.length) return p.live.replaceChildren(h('div.hint.warn', parsed.note || 'I could not find a link in that text. A link starts with https:// or looks like example.com/page.'));
  if (parsed.format.startsWith('instagram') && !st.manual) { const ig = sectorFor('', /instagram/i); if (ig) st.jobIds = new Set([ig.id]); }
  if (entries.length === 1) drawSingle(p, entries[0]); else drawMulti(p, entries, parsed.format);
}

// ---------- sector chooser shared by both modes ----------
function sectorChips(p, suggested, onChange) {
  const box = h('div.chips');
  const draw = () => {
    box.replaceChildren(...store.state.jobs.filter(j => !j.rule).map(j => chip(j.name, { dot: true, color: j.color, on: st.jobIds.has(j.id), onclick: () => { st.manual = true; st.jobIds.has(j.id) ? st.jobIds.delete(j.id) : st.jobIds.add(j.id); draw(); onChange && onChange(); sfx.feel('tap'); } })),
      chip('+ New sector', { cls: 't', onclick: async () => {
        const v = await promptBox({ title: 'New sector', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Design Lab' }, { key: 'color', label: 'Star colour', type: 'color', colors: store.STAR_COLORS, value: store.STAR_COLORS[store.state.jobs.length % store.STAR_COLORS.length] }], ok: 'Create' });
        if (v && v.name.trim()) { const j = store.addJob({ name: v.name, color: v.color }); game.award('sector', 1, j.name); st.jobIds.add(j.id); st.manual = true; draw(); onChange && onChange(); }
      } }));
  };
  draw(); return h('div.field', h('label', 'Sector'), box, suggested && suggested.length ? h('p.dim.small', 'Suggested: ' + suggested.map(s => s.j.name).join(', ') + '. Leave all unselected to park it in the Inbox.') : h('p.dim.small', 'Leave all unselected to park it in the Inbox.'));
}
const chosenJobs = () => { const ids = [...st.jobIds].filter(id => store.jobById(id)); return ids.length ? ids : [inbox().id]; };
const jobNames = ids => ids.map(id => (store.jobById(id) || {}).name).filter(Boolean).join(', ');

// ---------- one link ----------
function drawSingle(p, e) {
  const dup = store.findByUrl(e.url);
  const sib = dup ? [] : sameSite({ id: 'tmp', url: e.url, src: 'user' }, siteIndex(store.state.resources)).map(x => x.r).slice(0, 3);
  const title = h('input.in', { value: e.title || '', placeholder: domainOf(e.url), autocomplete: 'off' });
  const type = h('select.sel', store.TYPES.map(t => h('option', { value: t, selected: t === (e.type || inferType(e.url, e.title)) }, TYPE_LABEL[t])));
  const tags = h('input.in', { value: (e.tags && e.tags.length ? e.tags : inferTags(e.url, e.title)).join(', '), autocapitalize: 'off', autocomplete: 'off' });
  const use = h('input.in', { placeholder: 'e.g. turn a PDF into slides', autocomplete: 'off' });
  const sug = h('div.stack'), note = h('div.qa-guess');
  const draftRes = () => store.normalizeResource({ id: 'tmp', title: title.value, url: e.url, type: type.value, tags: tags.value, useWhen: use.value });
  const lk = LK.get(e.url) || (LK.set(e.url, { res: null, err: null, busy: false }), LK.get(e.url));
  const showGuess = () => { const g = lk.res || guessOf(draftRes(), null); note.replaceChildren(h('div.chips', topicChips(g)), h('p.dim.small', lk.busy ? 'Reading the page…' : (g.summary + (lk.err ? ' ' + errorTextShort(lk.err) : '')))); };
  const mergeFill = x => {   // fill empty boxes only, never overwrite what you typed
    const have = tags.value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!title.value.trim() && x.title && x.read) title.value = x.title;
    const nt = [...new Set(have.concat(x.tags))].slice(0, 12); tags.value = nt.join(', ');
    if (x.type && x.type !== 'article-site' && type.value === (e.type || inferType(e.url, e.title)) && store.TYPES.includes(x.type)) type.value = x.type;
  };
  lk.update = () => { if (!lk.err && lk.res) mergeFill(lk.res); showGuess(); drawSug(); };   // the newest drawing of this form listens for the answer
  if (!lk.res && !lk.busy && webStatus().ok && webSettings().web) {
    lk.busy = true;
    lookupResource(draftRes(), webSettings()).then(out => { lk.busy = false; lk.res = out.result; lk.err = out.ok ? null : out.error; if (lk.update) lk.update(); });
  }
  const tmp = () => ({ id: 'tmp', title: title.value || e.title || domainOf(e.url), url: e.url, type: type.value, tags: tags.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean), related: [], capabilities: [], useWhen: [] });
  const drawSug = () => {
    const t = tmp(), js = suggestJobs(t, store.state.jobs.filter(j => !j.rule), store.byId, 3), ls = suggestLinks(t, store.state.resources, 5);
    if (!st.manual && st.jobIds.size === 0 && js[0] && js[0].score >= 0.5) st.jobIds.add(js[0].j.id);
    if (st.relSeen !== e.url) { st.rel = new Set(ls.filter(x => x.score >= 5).slice(0, 2).map(x => x.r.id)); st.relSeen = e.url; }
    const sec = sectorChips(p, js, () => {});
    const rel = ls.length ? h('div.field', h('label', 'Connect it to'), h('div.chips', ls.map(x => chip(x.r.title.length > 30 ? x.r.title.slice(0, 29) + '…' : x.r.title, { icon: 'link', on: st.rel.has(x.r.id), cls: 'good', onclick: ev => { st.rel.has(x.r.id) ? st.rel.delete(x.r.id) : st.rel.add(x.r.id); ev.currentTarget.classList.toggle('on'); } }))), h('p.dim.small', 'Linked resources are joined by a line in the galaxy.')) : null;
    sug.replaceChildren(sec, rel);
  };
  const refresh = debounce(() => { drawSug(); if (!lk.res) showGuess(); }, 200); [title, tags, type].forEach(x => x.addEventListener('input', refresh)); type.addEventListener('change', refresh);
  const add = () => {
    const t = tmp(), ids = chosenJobs();
    const base = { title: title.value.trim(), url: e.url, type: type.value, tags: t.tags, useWhen: use.value, status: 'active', checkCadence: 'none', draft: false, src: 'user', research: 'user', folder: '' };
    const x = lk.res; if (x && (x.topic || x.read)) {   // what the guess or the page said is kept, and marked so you can review it
      const { patch } = buildPatch(store.normalizeResource({ ...base, id: 'tmp' }), x, 'fill'); Object.assign(base, patch);
      if (!use.value.trim() && (patch.useWhen || patch.capabilities)) { base.draft = true; base.research = x.read && x.via !== 'offline' ? 'scanned' : 'guess'; }
    }
    const r = store.addResource(base, ids);
    [...st.rel].forEach(id => store.link(r.id, id));
    game.award('add', 1, r.title.slice(0, 36)); closePanel('quickadd'); sfx.feel('spawn', [12, 40, 12]);
    setTimeout(() => { if (app.scene && app.ok) app.scene.select(r.id, { fly: true }); app.open.detail(r.id, { fly: false }); }, 420);
    toast('Launched into ' + jobNames(ids) + '.', { icon: 'rocket', ms: 5200, action: r.useWhen.length ? null : { label: 'Describe it', fn: () => app.open.detail(r.id, { edit: true, focus: 'useWhen' }) } });
  };
  p.live.replaceChildren(h('div.stack',
    dup ? h('div.hint.warn', h('b', 'Already saved: '), dup.title, '. ', h('button.lnk', { type: 'button', onclick: () => { closePanel('quickadd'); app.open.detail(dup.id); } }, 'Open it')) : null,
    sib.length ? h('div.hint.warn', h('b', 'Same site: '), 'you already have ', sib.map((r, i) => [i ? ', ' : '', h('button.lnk', { type: 'button', onclick: () => { closePanel('quickadd'); app.open.detail(r.id); } }, r.title.length > 34 ? r.title.slice(0, 33) + '…' : r.title), h('span.dim', ' (' + shortUrl(r.url, 30) + ')')]), '. Check you need both.') : null,
    h('div.qa-card', monogram({ id: 'x', url: e.url, title: e.title, tags: [] }, 48), h('div.grow', h('div.d-title', e.title || domainOf(e.url)), h('div.s.dim.ell', e.url))),
    h('div.field', h('label', 'Title'), title), h('div.two', h('div.field', h('label', 'Type'), type), h('div.field', h('label', 'Tags'), tags)),
    h('div.field', h('label', 'What is it about?'), note),
    h('div.field', h('label', 'Use it when (optional)'), use, h('p.dim.small', 'One line is enough. This is what the search looks at first.')),
    sug, h('div.d-acts', btn(dup ? 'Add anyway' : 'Add to galaxy', { cls: 'pri', icon: 'rocket', onclick: add }))));
  drawSug(); if (lk.res && !lk.busy && !lk.err) mergeFill(lk.res); showGuess();
}
const LK = new Map();
const errorTextShort = e => (e && e.code === 'skip' ? 'Not looked up online: ' + e.msg + '.' : (e && e.code === 'blocked' ? 'Could not read the page online.' : ''));

// ---------- many links ----------
function drawMulti(p, entries, format) {
  const fresh = entries.filter(e => !store.findByUrl(e.url)), dups = entries.length - fresh.length;
  p.live.replaceChildren(h('div.stack',
    h('div.hint', h('b', entries.length), ' links found', format === 'bookmarks' ? ' in a bookmarks file' : (format.startsWith('instagram') ? ' in an Instagram export' : ''), dups ? ' · ' + plural(dups, 'link') + ' already saved (skipped)' : '', '. The Import screen lets you choose sectors and guess topics before adding.'),
    h('div.d-acts', btn(fresh.length ? 'Review and add ' + fresh.length : 'Nothing new to add', { cls: 'pri', icon: 'rocket', disabled: !fresh.length, onclick: () => { const text = st.text; closePanel('quickadd'); app.open.import({ text }); } }))));
}
app.open.quickadd = openQuickAdd;
