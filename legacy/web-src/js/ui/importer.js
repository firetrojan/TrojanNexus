// ui/importer.js - the Import screen: pick files (or paste), see what each one is, choose where it goes, add. Bookmarks files, Instagram
// "Download your information" (ZIP, following.json or following.html), CSV, OPML, link lists. Reading files never touches the network.
import { h, plural, normUrl, shortUrl } from '../util.js';
import { flagEntries } from '../dupes.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { readSource } from '../importers.js';
import { listZip, readZipText, fileReader, isUsable } from '../zip.js';
import { analyse, buildPatch } from '../lookup.js';
import { app, setHighlight } from './app.js';
import { openPanel, closePanel, getPanel, btn, chip, ico, toast, promptBox, segmented } from './kit.js';
import { bulkLook, webStatus } from './scan.js';
import { offerUndo } from './safety.js';

let H = null, nid = 0;
const redraw = () => { const p = getPanel('import'); if (p) draw(p); };

export function openImport(o = {}) {
  H = { sources: [], mode: 'one', jobIds: new Set(), guess: true, look: true, busy: '', skipGone: true };
  const p = openPanel('import', { kind: 'overlay', title: 'Import', live: false, render: draw });
  if (o.text) addSource(readSource(o.name || 'Pasted text', o.text), o.text);
  if (o.sources) o.sources.forEach(s => addSource(s));
  if (o.text || o.sources) redraw();
  return p;
}

function addSource(src, text) {
  src.id = ++nid; src.off = false;
  if (src.backup && text) src.text = text;
  H.sources.push(src);
  return src;
}

// ---------- reading files ----------
const WANT_IN_ZIP = /(^|\/)(following\.(json|html?)|[^/]*bookmark[^/]*\.(json|html?|csv)|[^/]*favou?rite[^/]*\.(html?|csv|json)|[^/]*\.opml|raindrop[^/]*\.csv|pocket[^/]*\.(csv|html?)|ril_export\.html)$/i;
async function readZipFile(f) {
  const read = fileReader(f), list = await listZip(read, f.size);
  const hits = list.filter(e => isUsable(e.name) && WANT_IN_ZIP.test(e.name) && e.usize <= 30e6).slice(0, 8);
  if (!hits.length) {
    const insta = list.some(e => /(^|\/)(connections|your_instagram_activity|personal_information)\//.test(e.name) || /instagram/i.test(e.name));
    addSource({ name: f.name, kind: 'zip', label: 'ZIP file', entries: [], skip: true, note: insta ? 'This is an Instagram download, but it has no following list. Request the download again and choose "Followers and following".' : 'No bookmarks or following list found inside this ZIP.' });
    return;
  }
  for (const e of hits) {
    const text = await readZipText(read, e), s = readSource(e.name.split('/').pop(), text);
    s.from = f.name; addSource(s, text);
  }
}
async function addFiles(files) {
  for (const f of files) {
    H.busy = 'Reading ' + f.name + '…'; redraw();
    try {
      if (/\.zip$/i.test(f.name) || /zip/.test(f.type || '')) await readZipFile(f);
      else if (f.size > 25e6) addSource({ name: f.name, label: '', entries: [], skip: true, note: 'This file is too big (' + Math.round(f.size / 1048576) + ' MB).' });
      else { const text = await f.text(); addSource(readSource(f.name, text), text); }
    } catch (e) { addSource({ name: f.name, label: '', entries: [], skip: true, note: String((e && e.message) || e).slice(0, 140) }); }
  }
  H.busy = ''; redraw();
}
function pick() {
  const inp = h('input', { type: 'file', multiple: true, accept: '.zip,.json,.html,.htm,.csv,.tsv,.opml,.xml,.txt,.url,application/zip,application/json,text/html,text/csv,text/plain,text/xml', style: { display: 'none' } });
  inp.addEventListener('change', () => { const fs = [...(inp.files || [])]; inp.remove(); if (fs.length) addFiles(fs); });
  document.body.appendChild(inp); inp.click();
}
async function pasteText() {
  const v = await promptBox({ title: 'Paste links or a file', text: 'Paste a list of links, the text of a bookmarks file, or JSON.', fields: [{ key: 't', label: '', type: 'textarea', rows: 7, placeholder: 'https://…' }], ok: 'Read it' });
  if (v && v.t.trim()) { addSource(readSource('Pasted text', v.t), v.t); redraw(); }
}

// ---------- the plan: what would be added, and where ----------
const isIG = e => e.src === 'following' || (e.tags || []).includes('following');
function plan() {
  const seen = new Set(), fresh = []; let existing = 0, repeat = 0, gone = 0;
  for (const s of H.sources) {
    if (s.skip || s.off) continue;
    for (const e of s.entries) {
      const k = normUrl(e.url);
      if (seen.has(k)) { repeat++; continue; } seen.add(k);
      if (store.findByUrl(e.url)) { existing++; continue; }
      if (H.skipGone && store.wasDeleted(e.url)) { gone++; continue; }
      fresh.push(e);
    }
  }
  const site = flagEntries(fresh, store.state.resources).filter(f => f.others.some(o => o.saved));   // on a site you already have
  return { fresh, existing, repeat, gone, site };
}
const jobNamed = n => store.state.jobs.find(j => !j.rule && j.name.toLowerCase() === String(n).toLowerCase());
const topFolder = e => String(e.folder || '').split(' / ')[0].trim();
/** [{ name, entries, jobIds? }] - jobIds set when the user picked sectors; otherwise the sector is found or made by name. */
function groups(fresh) {
  const out = [], ig = fresh.filter(isIG), rest = fresh.filter(e => !isIG(e));
  if (ig.length) out.push({ name: (store.state.jobs.find(j => /instagram/i.test(j.name)) || {}).name || 'Instagram', entries: ig });
  if (!rest.length) return out;
  if (H.mode === 'folder') {
    const m = new Map(); rest.forEach(e => { const f = topFolder(e); if (!m.has(f)) m.set(f, []); m.get(f).push(e); });
    const big = [...m.entries()].filter(([f, a]) => f && a.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 12), names = new Set(big.map(x => x[0]));
    big.forEach(([f, a]) => out.push({ name: f, entries: a }));
    const left = rest.filter(e => !names.has(topFolder(e)));
    if (left.length) out.push({ name: 'Inbox', entries: left });
  } else {
    const ids = [...H.jobIds].filter(id => store.jobById(id));
    out.push(ids.length ? { name: ids.map(id => store.jobById(id).name).join(', '), entries: rest, jobIds: ids } : { name: 'Inbox', entries: rest });
  }
  return out;
}
function sectorIds(g) {
  if (g.jobIds) return g.jobIds;
  const ex = jobNamed(g.name);
  if (ex) return [ex.id];
  if (g.name === 'Inbox') return [store.ensureInbox().id];
  return [store.addJob({ name: g.name, color: store.STAR_COLORS[store.state.jobs.length % store.STAR_COLORS.length] }).id];
}
function withGuess(e) {
  const r = store.normalizeResource({ ...e, id: 'tmp' }), res = analyse(r, null), { patch } = buildPatch(r, res, 'fill');
  return { ...e, ...patch };
}

async function commit() {
  const { fresh } = plan(); if (!fresh.length) return;
  const added = [], names = [];
  for (const g of groups(fresh)) {
    const ids = sectorIds(g), r = store.addMany(g.entries.map(e => (H.guess ? withGuess(e) : e)), ids);
    added.push(...r.added); if (r.added.length) names.push(g.name);
  }
  game.award('import', added.length, plural(added.length, 'link') + ' imported'); sfx.feel('spawn', [12, 40, 12]);
  const look = H.look && webStatus().ok && added.length;
  closePanel('import');
  if (added.length) { setHighlight(added, 'new'); setTimeout(() => { if (app.scene && app.ok) { app.scene.clearSelection(); app.scene.frameIds(added); } }, 420); }
  const msg = plural(added.length, 'link') + ' added' + (names.length ? ' to ' + (names.length > 3 ? names.length + ' sectors' : names.join(', ')) : '') + '.';
  if (added.length > 1 && !look) offerUndo('Before an import', msg); else toast(msg, { icon: 'rocket', ms: 5200 });
  if (look) setTimeout(() => bulkLook(added), 900);
}

// ---------- drawing ----------
const row = (label, sub, on, fn, off) => h('div.set', h('div.grow', h('div.lab', label), sub ? h('div.sub', sub) : null),
  h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', disabled: off, 'aria-checked': String(!!on), 'aria-label': label, onclick: e => { const b = e.currentTarget, v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); fn(v); sfx.feel('tap'); } }));

/** New links that sit on a site you already have. They are still added; they are marked for a check in "To review". */
function siteFlags(list) {
  const rows = list.slice(0, 30).map(({ entry, others }) => {
    const saved = others.filter(o => o.saved), first = saved[0];
    return h('div.sf-row', h('div.t.ell', entry.title || shortUrl(entry.url)), h('div.s.dim.small.ell', shortUrl(entry.url, 60)),
      h('div.s.small', 'Saved already: ', h('b', first.title), saved.length > 1 ? ' and ' + (saved.length - 1) + ' more' : '', h('span.dim', ' · ' + shortUrl(first.url, 40))));
  });
  return h('details.how.sitefl', { open: list.length <= 3 }, h('summary', h('span', h('b', list.length), ' ' + (list.length === 1 ? 'link is' : 'links are') + ' on a site you already have')),
    h('div.how-body', h('p.dim.small', 'Same website, different page. They are still added, and marked "Same site" in To review so you can check whether you need both.'), rows, list.length > 30 ? h('p.dim.small', 'And ' + (list.length - 30) + ' more.') : null));
}

function help() {
  return h('details.how', h('summary', 'Where do I get these files?'),
    h('div.how-body',
      h('p', h('b', 'Instagram following list. '), 'In the Instagram app: Profile, menu, Accounts Center, Your information and permissions, Download your information. Choose "Followers and following", pick JSON or HTML, and request the download. Instagram tells you when it is ready. Then choose the ZIP here (or the following file inside it). Menu names change a little between versions.'),
      h('p', h('b', 'Browser bookmarks. '), 'Chrome, Edge, Brave: Bookmark manager, menu (three dots), Export bookmarks. Firefox: Library, Bookmarks, Manage, Import and Backup, Export to HTML. Safari: File, Export, Bookmarks. Most phone browsers cannot export, so use a computer, then send the file to your phone.'),
      h('p', h('b', 'Other lists. '), 'Raindrop, Pocket or Pinboard exports (CSV, HTML, JSON), OPML from a feed reader, a text file with one link per line, or links you paste.'),
      h('p.dim', 'Files are read on this device. Reading a file does not use the internet.')));
}

function sourceRow(s) {
  const n = s.entries.length, igList = s.kind === 'instagram' && !s.skip;
  const sub = s.skip ? s.note : (s.label + ' · ' + plural(n, igList ? 'account' : 'link') + (s.note ? ' · ' + s.note : ''));
  return h('div.src' + (s.skip ? '.skip' : '') + (s.off ? '.off' : ''),
    s.skip ? h('span.src-ic.warn', { html: icon('info') }) : h('button.tick' + (s.off ? '' : '.on'), { type: 'button', 'aria-label': s.off ? 'Include this file' : 'Leave this file out', onclick: () => { s.off = !s.off; redraw(); } }),
    h('div.grow', h('div.t', s.name), h('div.s' + (s.skip ? '.warnt' : ''), (s.from ? 'in ' + s.from + ' · ' : '') + sub),
      s.backup ? h('div.row', { style: { marginTop: '6px' } }, btn('Restore as backup', { cls: 'xs pri', onclick: () => { closePanel('import'); if (app.open.restoreBackup) app.open.restoreBackup(s.text); } })) : null),
    h('button.btn.icon.xs.ghost', { type: 'button', 'aria-label': 'Remove', onclick: () => { H.sources = H.sources.filter(x => x !== s); redraw(); }, html: icon('close', 'sm') }));
}

function sectorChoice(pl) {
  const rest = pl.fresh.filter(e => !isIG(e)); if (!rest.length) return null;
  const folders = new Set(rest.map(topFolder).filter(Boolean)), hasFolders = folders.size > 0;
  const box = [];
  if (hasFolders) box.push(segmented([{ v: 'one', l: 'One sector' }, { v: 'folder', l: 'By bookmark folder' }], H.mode, v => { H.mode = v; redraw(); }, { instant: true }));
  if (H.mode === 'folder' && hasFolders) {
    const gs = groups(pl.fresh).filter(g => !isIG(g.entries[0]));
    box.push(h('div.list.fl', gs.map(g => h('div.fl-row', h('i.dot', { style: { '--c': (jobNamed(g.name) || {}).color || '#8da2c8' } }), h('span.grow', g.name), !jobNamed(g.name) && g.name !== 'Inbox' ? chip('new', { cls: 't' }) : null, h('b.dim', g.entries.length)))));
    box.push(h('p.dim.small', 'Top-level folders with 3 or more links become sectors. Everything else goes to the Inbox.'));
  } else {
    const chips = h('div.chips');
    const draw = () => chips.replaceChildren(...store.state.jobs.filter(j => !j.rule).map(j => chip(j.name, { dot: true, color: j.color, on: H.jobIds.has(j.id), onclick: () => { H.jobIds.has(j.id) ? H.jobIds.delete(j.id) : H.jobIds.add(j.id); draw(); sfx.feel('tap'); } })),
      chip('+ New sector', { cls: 't', onclick: async () => { const v = await promptBox({ title: 'New sector', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Design Lab' }, { key: 'color', label: 'Star colour', type: 'color', colors: store.STAR_COLORS, value: store.STAR_COLORS[store.state.jobs.length % store.STAR_COLORS.length] }], ok: 'Create' }); if (v && v.name.trim()) { const j = store.addJob({ name: v.name, color: v.color }); game.award('sector', 1, j.name); H.jobIds.add(j.id); draw(); } } }));
    draw(); box.push(chips, h('p.dim.small', 'Leave all unselected to park them in the Inbox.'));
  }
  return h('div.field', h('label', 'Where should they go?'), h('div.stack', { style: { gap: '10px' } }, box));
}

function draw(p) {
  p.setActions();
  const pl = plan();
  if (H.mode === 'folder' && !pl.fresh.some(e => !isIG(e) && topFolder(e))) H.mode = 'one';
  const importable = H.sources.filter(s => !s.skip && !s.off), igN = pl.fresh.filter(isIG).length, web = webStatus();
  const out = [];
  out.push(h('div.impdrop', h('div.big', { html: icon('upload', 'lg') }), h('b', 'Import files'),
    h('p.dim', 'Bookmarks from your browser, your Instagram following list (the ZIP or the file), CSV or OPML lists, or plain links.'),
    h('div.row.wrap.c', btn(H.busy || 'Choose files', { cls: 'pri', icon: 'upload', disabled: !!H.busy, onclick: pick }), btn('Paste text', { icon: 'copy', onclick: pasteText }))));
  out.push(help());
  if (H.sources.length) out.push(h('div.sec-h', h('h3', 'Found'), h('span.n', plural(H.sources.length, 'file'))), h('div.list', H.sources.map(sourceRow)));
  if (importable.length) {
    out.push(h('div.hint', h('b', pl.fresh.length), ' new ' + (pl.fresh.length === 1 ? 'link' : 'links'),
      pl.existing ? ' · ' + pl.existing + ' already saved (skipped)' : '', pl.repeat ? ' · ' + pl.repeat + ' repeated' : '', pl.gone ? ' · ' + pl.gone + ' deleted before (skipped)' : '',
      igN ? ' · ' + plural(igN, 'Instagram account') + ' go to the Instagram sector' : '', '. They are added as "to review".'));
    if (pl.site.length) out.push(siteFlags(pl.site));
    if (store.deletedCount()) out.push(h('div.group', row('Skip links I deleted before', plural(store.deletedCount(), 'deleted link') + ' remembered, so a new export does not bring them back.', H.skipGone, v => { H.skipGone = v; redraw(); })));
    if (pl.fresh.length) {
      const sc = sectorChoice(pl); if (sc) out.push(sc);
      out.push(h('div.group',
        row('Guess what each is about', 'Fills tags and "use it when" from names and links. Works offline.', H.guess, v => { H.guess = v; }),
        row('Then look them up online', web.ok ? 'Reads the real pages afterwards. You confirm first.' : web.text, H.look && web.ok, v => { H.look = v; }, !web.ok)));
    }
    out.push(h('div.d-acts', btn(pl.fresh.length ? 'Add ' + plural(pl.fresh.length, 'link') + ' to the galaxy' : 'Nothing new to add', { cls: 'pri', icon: 'rocket', disabled: !pl.fresh.length, onclick: commit })));
  }
  p.body.replaceChildren(h('div.stack.imp', out));
}
app.open.import = openImport;
