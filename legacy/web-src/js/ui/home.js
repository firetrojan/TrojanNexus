// ui/home.js - the Home screen: what needs you, your launch pad, a quick review and search, on ONE screen.
// Everything here is done in place (buttons in the tile, sheets on top). Nothing makes you change screens to get a small job done.
import { h, domainOf, shortUrl, plural, debounce, todayISO } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { search } from '../search.js';
import { suggestFix } from '../spell.js';
import { siteIndex, sameSite } from '../dupes.js';
import { TILES, normHome, visibleTiles, launchList, needsItems, nextAction, reviewQueue, exampleQueries, normShelves, shelfList, MAX_SHELVES } from '../home.js';
import { liveVisits, agoText } from '../recent.js';
import { lookupResource, errorText, isFramed } from '../lookup.js';
import { app } from './app.js';
import { openPanel, getPanel, btn, chip, toast, dialog, actionSheet, monogram, pickDialog, segmented, canShareFiles, FRAMED } from './kit.js';
import { upcomingEvents } from '../exporters.js';
import { applyResult, webSettings, webStatus } from './scan.js';
import { openResource } from './launch.js';
import { progress, pickActive } from '../mission.js';
import { activePicks, resetDue, togglePick, snoozeReset } from '../week.js';
import { MODES, timePlan } from '../time.js';
import { fitFor, fitLine, choiceRow } from './fit.js';
import { toggleStep, stepsLine, progBar } from './missions.js';
import { goMatches, runJump } from './jump.js';

const H = { q: '', mode: 'fav', more: false, editPins: false, skipped: [], busy: '', time: '' };
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

export function openHome() {
  return openPanel('home', { kind: 'view', title: 'Home', cls: 'home', render: render });
}
const redraw = () => { const p = getPanel('home'); if (p) render(p); };

// ---------- the frame: header, search box (kept between redraws so typing is never interrupted), and the part that changes ----------
function render(p) {
  if (!p._built) build(p);
  const st = store.stats(), keep = p.scroller.scrollTop;
  p.setActions(btn('', { cls: 'ghost icon', icon: 'plus', title: 'Add a link', onclick: () => app.open.quickadd() }), btn('Edit', { cls: 'ghost', onclick: customize }));
  const dt = new Date().toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  p._sub.textContent = dt + ' · ' + plural(st.total, 'resource') + (st.drafts ? ' · ' + st.drafts + ' to review' : '');
  drawOut(p); p.scroller.scrollTop = keep;
}
function build(p) {
  p._built = true;
  const input = p._input = h('input.in', { type: 'search', enterkeyhint: 'search', placeholder: 'Can I… or go to… (backup)', value: H.q, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search or ask what you can do' });
  const clear = h('button.q-x', { type: 'button', 'aria-label': 'Clear search', html: icon('close', 'sm'), onclick: () => { input.value = ''; H.q = ''; clear.classList.add('hide'); drawOut(p); input.focus(); } });
  clear.classList.toggle('hide', !H.q);
  const go = debounce(() => { H.q = input.value; clear.classList.toggle('hide', !H.q); drawOut(p); }, 120);
  input.addEventListener('input', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { go.flush(); input.blur(); } });
  p._sub = h('div.home-sub');
  p._tries = h('div.chips.scrollx.home-tries');
  p._out = h('div.home-out');
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const mic = SR ? h('button.q-x.q-mic', { type: 'button', 'aria-label': 'Speak your search', title: 'Speak your search', html: icon('mic', 'sm'), onclick: () => listen(input, mic) }) : null;
  p.body.replaceChildren(h('div.home', p._sub, h('div.tile.home-search', h('span.ico-s', { html: icon('search') }), input, clear, mic), p._tries, p._out, h('p.home-ver', 'Nexus ' + BUILD)));
}
function drawOut(p) {
  const q = H.q.trim();
  if (q) { p._tries.replaceChildren(); p._out.replaceChildren(results(q)); return; }
  const ex = exampleQueries(store.state.resources, 3, new Date().getDate());
  p._tries.replaceChildren(chip('Paste a link', { cls: 'good', icon: 'link', onclick: pasteLink }), ...(ex.length ? [h('span.dim.small', { style: { flex: 'none', alignSelf: 'center' } }, 'Try')].concat(ex.map(x => chip(x, { cls: 't', onclick: () => { p._input.value = x; H.q = x; p._input.dispatchEvent(new Event('input')); } }))) : []));
  const ids = visibleTiles(store.getSetting('home')), tiles = ids.map(id => TILE[id]()).filter(Boolean);
  p._out.replaceChildren(tiles.length ? h('div.home-grid', tiles) : h('div.empty', h('b', 'All tiles are hidden'), h('p', 'Tap Edit (top right) to bring some back.')));
}

// ---------- capture helpers: paste a link, speak a search ----------
async function pasteLink() {
  let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) { /* blocked: Quick Add has its own Paste button */ }
  const has = /https?:\/\/\S+/i.test(t || '');
  app.open.quickadd({ text: has ? t.trim().slice(0, 4000) : '' });
  if (!has) toast(t ? 'There is no link in what you copied. Paste or type one here.' : 'Tap Paste in the box. Your browser did not let Nexus read the clipboard.', { icon: 'info' });
}
let REC = null;
function listen(input, mic) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  if (REC) { try { REC.stop(); } catch (e) { /* already stopped */ } return; }
  const rec = REC = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.onresult = e => { input.value = [...e.results].map(r => r[0].transcript).join(' ').trim(); input.dispatchEvent(new Event('input')); };
  rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast(e.error === 'not-allowed' ? 'The microphone is blocked. Allow it in the browser settings, then try again.' : e.error === 'network' ? 'Voice search needs the internet on most phones.' : 'Could not hear you. Try again.', { icon: 'info' }); };
  rec.onend = () => { REC = null; mic.classList.remove('on'); };
  mic.classList.add('on'); try { rec.start(); } catch (e) { REC = null; mic.classList.remove('on'); }
}

// ---------- search, in place ----------
function results(q) {
  let res = search(store.state.resources, q, { mode: 'and', types: new Set(), statuses: new Set() }), relaxed = 0;
  if (!res.results.length && res.tokens.length > 1) {   // nothing matches every word: show the closest matches rather than a dead end
    const any = search(store.state.resources, q, { mode: 'or', types: new Set(), statuses: new Set() }), top = any.results.length ? any.results[0].matched : 0;
    if (top > 0) { res = { tokens: any.tokens, results: any.results.filter(x => x.matched === top) }; relaxed = top; }
  }
  const n = res.results.length, cmds = goMatches(q);
  const go = c => { const p = getPanel('home'); H.q = ''; if (p && p._input) p._input.value = ''; runJump(c.id); };
  const goBlock = cmds.length ? h('section.tile.t-go', h('div.tile-h', h('span', 'Go to')), cmds.map(c => h('div.nrow', h('span.n-ic', { html: icon(c.icon) }),
    h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => go(c) }, c.label), h('div.s', c.sub)), h('div.acts', btn('Go', { cls: 'xs pri', onclick: () => go(c) }))))) : null;
  if (!n && goBlock) return goBlock;
  const fix = !n || relaxed ? suggestFix(store.state.resources, q) : null;   // "Did you mean": only a fix that finds something
  const dym = fix ? h('div.row.wrap.dym', h('span.dim.small', 'Did you mean'), chip(fix.q + ' (' + fix.n + ')', { cls: 'good', onclick: () => { const p = getPanel('home'); H.q = fix.q; if (p && p._input) { p._input.value = fix.q; p._input.dispatchEvent(new Event('input')); } sfx.feel('tap'); } }), h('span.dim.small', '?')) : null;
  if (!n) return h('div.tile', h('b', 'Nothing matches "' + q + '"'), dym, h('p.dim.small', 'Try other words, or fewer. Search looks at what each resource is for, what it can do, and its name and tags.'),
    h('div.row.wrap', btn('Add it', { cls: 'sm pri', icon: 'plus', onclick: () => app.open.quickadd() })));
  const tileRes = h('div.tile', h('div.tile-h', h('span', n + (n === 1 ? ' match' : ' matches')), btn(n > 6 ? 'All ' + n : 'More options', { cls: 'xs', onclick: () => app.open.search(q) })),
    relaxed ? h('p.dim.small', 'Nothing matches all ' + res.tokens.length + ' words. These match ' + relaxed + ' of them.') : null,
    dym,
    res.results.slice(0, 6).map(({ r }) => h('div.nrow', monogram(r, 36),
      h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, r.title), h('div.s', r.useWhen[0] || domainOf(r.url) || r.tags.slice(0, 3).map(t => '#' + t).join(' '))),
      r.url ? btn('Open', { cls: 'xs pri', icon: 'open', onclick: () => openResource(r) }) : null)));
  return goBlock ? h('div.home-res', goBlock, tileRes) : tileRes;
}

// ---------- tiles ----------
const tileHead = (title, right) => h('div.tile-h', h('span', title), right || null);

function tileNeeds() {
  const items = needsItems(store.state.resources, store), nudge = store.backupNudge(), rows = items.slice(0, 4).map(needRow);
  if (nudge.due && rows.length < 4) rows.push(h('div.nrow', h('span.n-ic', { html: icon('download') }), h('div.grow', h('div.t', 'Back up your data'), h('div.s', nudge.days === null ? 'No backup downloaded yet' : 'Last backup ' + plural(nudge.days, 'day') + ' ago')),
    h('div.acts', btn('Back up', { cls: 'xs pri', onclick: async () => { await app.open.backupNow(FRAMED ? 'copy' : (canShareFiles() ? 'share' : 'file')); redraw(); } }), btn('Later', { cls: 'xs', onclick: () => { store.setSetting('backupSnooze', addDaysISO(7)); redraw(); } }))));
  const count = items.length + (nudge.due ? 1 : 0);
  if (!rows.length) {
    let a = nextAction({ drafts: store.stats().drafts, stale: store.stats().stale, total: store.state.resources.length, pins: store.state.resources.filter(r => r.pinned).length });
    if (a.id === 'pin') a = { id: 'clear', text: 'Nothing needs you right now.', button: '' };   // the Launch pad tile below already offers pinning
    return h('section.tile.t-needs', tileHead('Needs you'), h('div.home-clear', h('span.ok-ic', { html: icon('check') }), h('div.grow', h('b', a.id === 'clear' ? 'All clear' : 'Nothing is due'), h('p.dim.small', a.text)),
      a.button ? btn(a.button, { cls: 'xs pri', onclick: () => nextRun(a.id) }) : null));
  }
  const evs = upcomingEvents(store.state.resources, { days: 90 }).length;
  return h('section.tile.t-needs', tileHead('Needs you', h('span.row', { style: { gap: '8px' } }, evs ? btn('Calendar', { cls: 'xs ghost', icon: 'clock', title: 'Put these dates in your phone calendar', onclick: () => app.open.exportCalendar() }) : null, h('span.tile-n', count))), rows, count > rows.length ? h('div.row', { style: { justifyContent: 'center', marginTop: '6px' } }, btn('See all ' + count, { cls: 'xs', onclick: () => app.open.alerts('due') })) : null);
}
const addDaysISO = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function nextRun(id) {
  if (id === 'review') { const el = document.querySelector('.home .t-review'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); else app.open.alerts('scan'); }
  else if (id === 'stale') app.open.alerts('stale');
  else if (id === 'pin') pinSome();
  else if (id === 'add') app.open.quickadd();
}

function needRow({ kind, r, sub }) {
  const t = h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, r.title);
  let acts;
  if (kind === 'trial') acts = [btn('Keep', { cls: 'xs pri', onclick: () => app.open.verdict(r, 'keep') }), btn('Drop', { cls: 'xs', onclick: () => app.open.verdict(r, 'drop') })];
  else if (kind === 'changed') acts = [btn('Open', { cls: 'xs pri', onclick: () => openResource(r) }), btn('Seen', { cls: 'xs', onclick: () => { store.markWatchSeen(r.id); sfx.feel('ok'); } })];
  else if (kind === 'check') acts = [btn('Done', { cls: 'xs pri', onclick: () => { store.markChecked(r.id); game.award('check', 1, r.title.slice(0, 36)); sfx.feel('ok', [10, 25]); } }), btn('Snooze', { cls: 'xs', onclick: () => actionSheet({ title: 'Snooze ' + r.title.slice(0, 40), items: [{ label: '1 day', icon: 'clock', run: () => { store.snooze(r.id, 1); toast('Back tomorrow.', { icon: 'clock' }); } }, { label: '1 week', icon: 'clock', run: () => { store.snooze(r.id, 7); toast('Back in a week.', { icon: 'clock' }); } }] }) })];
  else acts = [btn('Details', { cls: 'xs', onclick: () => app.open.detail(r.id, { fly: false }) })];
  return h('div.nrow', monogram(r, 34), h('div.grow', t, h('div.s', sub)), h('div.acts', acts));
}

// ---- launch pad ----
function launchCell(r, edit) {
  let timer = 0;
  const el = h('button.lp-i' + (r.pinned ? '.pinned' : ''), { type: 'button', title: r.title,
    onclick: () => { if (el._long) { el._long = false; return; } if (edit) { store.setPinned(r.id, !r.pinned); sfx.feel('tap'); } else { sfx.feel('tap', 6); openResource(r); } },
    oncontextmenu: e => { e.preventDefault(); app.open.detail(r.id, { fly: false }); } },
    h('span.lp-ic', monogram(r, 46), edit ? h('i.lp-badge' + (r.pinned ? '.on' : '')) : (r.pinned ? h('i.lp-pin', { html: icon('star', 'sm') }) : null)), h('span.ell', r.title));
  el.addEventListener('pointerdown', () => { el._long = false; timer = setTimeout(() => { el._long = true; sfx.feel('open', 8); app.open.detail(r.id, { fly: false }); }, 520); });
  ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(ev => el.addEventListener(ev, () => clearTimeout(timer)));
  return el;
}

function tileLaunch() {
  const total = launchList(store.state.resources, H.mode, 99).length, n = H.more || total <= 12 ? 24 : 8, list = launchList(store.state.resources, H.mode, n), edit = H.editPins;
  const seg = segmented([{ v: 'fav', l: 'Favourites' }, { v: 'recent', l: 'Recent' }], H.mode, v => { H.mode = v; redraw(); }, { instant: true, cls: 'sm' });
  const cell = r => launchCell(r, edit);
  const hasAny = store.state.resources.some(r => r.pinned || r.opens > 0);
  const body = list.length ? h('div.lp', list.map(cell), edit ? h('button.lp-i.add', { type: 'button', onclick: pinSome }, h('span.lp-ic', h('span.mono-ic.add', { style: { '--s': '46px' }, html: icon('plus') })), h('span', 'Pin')) : null)
    : h('div.home-clear', h('div.grow', h('b', H.mode === 'recent' ? 'Nothing opened yet' : 'No favourites yet'), h('p.dim.small', hasAny ? 'Nothing here for this view.' : 'Open links from here or from any list and the ones you use most show up automatically. Or pin your own.')), btn('Pin some', { cls: 'xs pri', onclick: pinSome }));
  return h('section.tile.t-launch', tileHead('Launch pad', btn(edit ? 'Done' : 'Edit', { cls: 'xs ghost', onclick: () => { H.editPins = !edit; redraw(); } })), h('div.home-seg', seg), body,
    edit ? h('p.dim.small', 'Tap a link to pin or unpin it. Pinned links stay first.') : (total > 12 ? h('div.row', { style: { justifyContent: 'center', marginTop: '8px' } }, btn(H.more ? 'Fewer' : 'Show all ' + total, { cls: 'xs', onclick: () => { H.more = !H.more; redraw(); } })) : null));
}
async function pinSome() {
  const o = await pickDialog('Pin a link to Home', new Set(store.state.resources.filter(r => r.pinned || !r.url).map(r => r.id)));
  if (o) { store.setPinned(o.id, true); toast('Pinned ' + o.title.slice(0, 40) + '.', { icon: 'star' }); H.editPins = true; redraw(); }
}

// ---- mission: the next step of the mission you are on ----
function tileMission() {
  const has = id => !!store.byId(id), t = pickActive(store.state.threads, store.getSetting('activeMission'), has);
  if (!t) return null;
  const p = progress(t, has), nx = p.next, r = nx && store.byId(nx.s.rid); if (!r) return null;
  const open = store.state.threads.filter(x => { const q = progress(x, has); return q.total && !q.complete; });
  return h('section.tile.t-mission', tileHead('Mission', btn('All', { cls: 'xs ghost', onclick: () => app.open.missions() })),
    h('div.mh', h('div.t', t.name), h('div.s.dim', stepsLine(t))), progBar(t),
    h('div.nrow', monogram(r, 36), h('div.grow', h('div.t', 'Step ' + (nx.i + 1) + ': ' + r.title), h('div.s', nx.s.note || domainOf(r.url) || r.tags.slice(0, 3).join(', ')))),
    h('div.row.wrap', btn('Done', { cls: 'xs pri', icon: 'check', onclick: () => toggleStep(t, nx.i) }),
      r.url ? btn('Open', { cls: 'xs', icon: 'open', onclick: () => openResource(r) }) : null,
      btn('Details', { cls: 'xs', icon: 'eye', onclick: () => app.open.detail(r.id, { fly: false }) }),
      open.length > 1 ? btn('Switch', { cls: 'xs', onclick: () => actionSheet({ title: 'Mission on Home', items: open.map(x => ({ label: x.name, sub: stepsLine(x), icon: 'mission', run: () => { store.setSetting('activeMission', x.id); redraw(); } })) }) }) : null));
}

// ---- quick review: one link at a time ----
function tileReview() {
  const q = reviewQueue(store.state.resources, H.skipped); if (!q.length) return null;
  const r = q[0], total = q.length, desc = r.scan && r.scan.desc ? r.scan.desc : '', others = sameSite(r, siteIndex(store.state.resources)), web = webStatus();
  const prev = { draft: r.draft, status: r.status }, fit = fitFor(r);
  const keepIn = j => { game.award('review', 1, r.title.slice(0, 30)); done({ draft: false }, 'Kept in ' + j.name + '.', 'check', j); };
  const row = choiceRow(r, keepIn);
  const done = (patch, msg, icn, job) => {
    if (job) store.addToJob(job.id, r.id, true);
    store.updateResource(r.id, patch); sfx.feel('ok');
    toast(msg, { icon: icn, ms: 3800, action: { label: 'Undo', fn: () => { if (job) store.removeFromJob(job.id, r.id, true); store.updateResource(r.id, prev); redraw(); } } });
  };
  const keepPlain = () => { game.award('review', 1, r.title.slice(0, 30)); done({ draft: false }, 'Kept.', 'check'); };
  const archiveIt = () => { game.award('archive'); done({ status: 'archived', draft: false }, 'Archived. A new export will not add it again.', 'layers'); };
  const read = async () => {
    H.busy = r.id; redraw();
    const out = await lookupResource(store.byId(r.id) || r, webSettings());
    H.busy = '';
    if (out.result && (out.ok || out.result.topic || out.result.desc)) applyResult(store.byId(r.id) || r, out.result, 'fill');
    if (!out.ok) toast(errorText(out.error, { framed: isFramed() }), { icon: 'info', ms: 5200 });
    redraw();
  };
  return h('section.tile.t-review', tileHead('Quick review', h('span.tile-n', total + ' left')),
    swipeCard(h('div.rv', h('div.row', { style: { gap: '10px' } }, monogram(r, 38), h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, r.title), h('div.s.ell', shortUrl(r.url, 56) || 'No link'))),
      fitLine(fit), row,
      others.length ? h('div.sc-flag', h('b', 'Same site'), ' as ' + others[0].r.title.slice(0, 40) + (others.length > 1 ? ' and ' + (others.length - 1) + ' more' : '') + '. Check you need both. ', btn('Merge into ' + others[0].r.title.slice(0, 18), { cls: 'xs', onclick: () => app.open.mergeFlow(others[0].r.id, r.id) })) : null,
      desc ? [h('div.sc-lab', 'From the page'), h('p.sc-desc', '“' + desc + '”')] : (r.notes ? [h('div.sc-lab', 'First guess'), h('p.sc-desc', r.notes)] : h('p.dim.small', 'Nothing is known about it yet beyond the name and link.' + (web.ok ? ' Tap Read page.' : ''))),
      r.tags.length ? h('div.chips.sc-tags', r.tags.slice(0, 6).map(t => chip('#' + t))) : null,
      h('div.row.wrap', btn(row ? 'Keep, no sector' : 'Keep', { cls: 'xs' + (row ? '' : ' pri'), icon: 'check', onclick: keepPlain }),
        btn('Archive', { cls: 'xs', icon: 'layers', onclick: archiveIt }),
        btn('Skip', { cls: 'xs', onclick: () => { H.skipped = H.skipped.filter(x => x !== r.id).concat(r.id); redraw(); } }),
        r.url ? btn('Open', { cls: 'xs', icon: 'open', onclick: () => openResource(r) }) : null,
        r.url && web.ok && !(r.scan && r.scan.via !== 'offline') ? btn(H.busy === r.id ? 'Reading…' : 'Read page', { cls: 'xs', icon: 'signal', disabled: !!H.busy, onclick: read }) : null,
        btn('Details', { cls: 'xs', icon: 'eye', onclick: () => app.open.detail(r.id, { fly: false }) })),
      h('p.dim.small.rv-hint', 'Swipe right to keep, left to archive.')), { right: keepPlain, left: archiveIt }));
}

/** Swipe a card sideways like a deck of cards: right = first action, left = second. Buttons inside it still work, and up/down still scrolls. */
function swipeCard(el, act) {
  let x0 = 0, y0 = 0, dx = 0, on = false, drag = false;
  el.classList.add('swipe');
  const rest = () => { el.style.transform = ''; el.classList.remove('dragging'); el.removeAttribute('data-dir'); };
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, input, textarea, select') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    on = true; drag = false; x0 = e.clientX; y0 = e.clientY; dx = 0;
  });
  el.addEventListener('pointermove', e => {
    if (!on) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!drag) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { on = false; return; }   // it is a scroll, not a swipe
      if (Math.abs(mx) < 12) return;
      drag = true; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    dx = mx; el.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 50) + 'deg)';
    el.dataset.dir = dx > 50 ? 'right' : (dx < -50 ? 'left' : '');
  });
  const end = () => { if (!on) return; on = false; const was = dx, went = drag; drag = false; rest(); if (!went) return; if (was > 100) act.right(); else if (was < -100) act.left(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { on = false; drag = false; rest(); });
  return el;
}

// ---- sectors ----
function tileSectors() {
  const js = store.state.jobs.filter(j => j.members.length).sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  if (!js.length) return null;
  return h('section.tile', tileHead('Sectors', btn('All', { cls: 'xs ghost', onclick: () => app.open.sectors() })),
    h('div.chips', js.slice(0, 12).map(j => chip(j.name + ' ' + j.members.length, { dot: true, color: j.color, onclick: () => app.open.sectorCard(j.id, { fly: false }) })), js.length > 12 ? chip('+' + (js.length - 12), { cls: 't', onclick: () => app.open.sectors() }) : null));
}
// ---- this week: your 3 picks, and the weekly reset when it is due ----
function tileWeek() {
  const today = todayISO(), w = store.getSetting('weekly'), has = id => !!store.byId(id);
  const picks = activePicks(w, today, has), rs = resetDue(w, today, store.state.resources.length);
  if (!picks.length && !rs.due) return null;
  const rows = picks.map(pk => {
    const r = store.byId(pk.rid);
    return h('div.nrow' + (pk.done ? '.is-done' : ''), monogram(r, 34),
      h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, r.title), h('div.s', pk.done ? 'Done' : (domainOf(r.url) || r.tags.slice(0, 3).join(', ') || 'No link'))),
      h('div.acts', btn(pk.done ? 'Undo' : 'Done', { cls: 'xs' + (pk.done ? '' : ' pri'), onclick: () => { store.setSetting('weekly', togglePick(w, r.id)); sfx.feel('ok'); } }),
        !pk.done && r.url ? btn('Open', { cls: 'xs', onclick: () => openResource(r) }) : null));
  });
  const nudge = rs.due ? h('div.nrow.wk-nudge', h('span.n-ic', { html: icon('check') }),
    h('div.grow', h('div.t', { style: { cursor: 'default' } }, 'Weekly reset'), h('div.s', rs.days === null ? 'Never done. A few minutes to get on top of things.' : 'Last one was ' + plural(rs.days, 'day') + ' ago.')),
    h('div.acts', btn('Start', { cls: 'xs pri', onclick: () => app.open.reset() }), btn('Later', { cls: 'xs', onclick: () => { store.setSetting('weekly', snoozeReset(w, today)); } }))) : null;
  const left = picks.filter(x => !x.done).length;
  return h('section.tile.t-week', tileHead('This week', picks.length ? h('span.tile-n' + (left ? '' : '.ok'), left ? left + ' left' : 'All done') : null), rows, nudge);
}

// ---- time I have: a short list for 10 minutes, an hour, or a tired day ----
function timeCtx() {
  const today = todayISO(), st = store.stats(today), has = id => !!store.byId(id), nudge = store.backupNudge(today);
  const needs = needsItems(store.state.resources, store, today), t = pickActive(store.state.threads, store.getSetting('activeMission'), has), p = t && progress(t, has);
  return { drafts: st.drafts, easy: reviewQueue(store.state.resources).filter(r => r.scan && r.scan.desc).length, attention: needs.length, overdueTrials: needs.filter(x => x.kind === 'trial' && x.rank === 0).length,
    missionLeft: p ? p.left : 0, missionName: t ? t.name : '', stale: st.stale, backupDue: nudge.due };
}
function goTo(id) {
  const el = ({ review: '.t-review', needs: '.t-needs', mission: '.t-mission' })[id], node = el && document.querySelector('.home ' + el);
  if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (id === 'review') app.open.alerts('scan'); else if (id === 'needs') app.open.alerts(); else if (id === 'mission') app.open.missions();
  else if (id === 'stale') app.open.alerts('stale'); else if (id === 'backup') app.open.backupNow(FRAMED ? 'copy' : (canShareFiles() ? 'share' : 'file'));
}
function tileTime() {
  if (store.state.resources.length < 5) return null;
  const plan = H.time ? timePlan(H.time, timeCtx()) : null;
  return h('section.tile.t-time', tileHead('Time I have'),
    h('div.row.wrap', MODES.map(m => btn(m.l, { cls: 'xs' + (H.time === m.v ? ' pri' : ''), onclick: () => { H.time = H.time === m.v ? '' : m.v; redraw(); } }))),
    plan ? [h('p.dim.small', plan.lead), plan.items.map(it => h('div.nrow', h('div.grow', h('div.t', { style: { cursor: 'default' } }, it.text)), h('div.acts', btn('Go', { cls: 'xs pri', onclick: () => goTo(it.id) }))))]
      : h('p.dim.small', 'Pick how much time or energy you have. You get a short list, not everything.'));
}
// ---- continue: where you left off ----
function tileContinue() {
  const exists = (k, id) => k === 'r' ? !!store.byId(id) : (k === 's' ? !!store.jobById(id) : !!store.threadById(id));
  const list = liveVisits(store.getSetting('recent'), exists, 4); if (!list.length) return null;
  const now = Date.now();
  const row = e => {
    if (e.k === 'r') { const r = store.byId(e.id); return { ic: monogram(r, 34), t: r.title, s: [domainOf(r.url), agoText(e.at, now)].filter(Boolean).join(' · '), go: () => app.open.detail(r.id, { fly: false }) }; }
    if (e.k === 's') { const j = store.jobById(e.id); return { ic: h('span.mono-ic', { style: { '--c': j.color, '--ink': '#fff', '--s': '34px' }, html: icon('sectors') }), t: j.name, s: 'Sector · ' + plural(j.members.length, 'link') + ' · ' + agoText(e.at, now), go: () => app.open.sectorCard(j.id, { fly: false }) };  }
    const t = store.threadById(e.id); return { ic: h('span.mono-ic', { style: { '--c': '#5856D6', '--ink': '#fff', '--s': '34px' }, html: icon('mission') }), t: t.name, s: 'Mission · ' + stepsLine(t) + ' · ' + agoText(e.at, now), go: () => app.open.missions(t.id) };
  };
  return h('section.tile.t-cont', tileHead('Continue'), list.map(e => { const x = row(e); return h('div.nrow.cont', { role: 'button', tabindex: '0', onclick: x.go }, x.ic, h('div.grow', h('div.t', x.t), h('div.s', x.s))); }));
}

// ---- shelves: sectors pinned to Home as launch buttons ----
function tileShelves() {
  const shelves = normShelves(store.getSetting('shelves')).map(sh => store.jobById(sh.job)).filter(Boolean); if (!shelves.length) return null;
  return h('div.shelves', shelves.map(j => {
    const list = shelfList(j.members, store.byId, 8);
    return h('section.tile.t-shelf', tileHead(j.name, h('span.row', { style: { gap: '6px' } }, btn('All ' + j.members.length, { cls: 'xs ghost', onclick: () => app.open.sectorCard(j.id, { fly: false }) }))),
      list.length ? h('div.lp', list.map(r => launchCell(r, false))) : h('p.dim.small', 'No links with an address in this sector yet.'));
  }));
}
const TILE = { needs: tileNeeds, week: tileWeek, mission: tileMission, continue: tileContinue, launch: tileLaunch, shelves: tileShelves, time: tileTime, review: tileReview, sectors: tileSectors };

// ---------- shelves ----------
const shelves = () => normShelves(store.getSetting('shelves')).map(sh => store.jobById(sh.job)).filter(Boolean);
function addShelf(after) {
  const have = new Set(shelves().map(j => j.id)), opts = store.state.jobs.filter(j => !have.has(j.id) && j.members.length).sort((a, b) => b.members.length - a.members.length);
  if (!opts.length) return toast('Every sector with links is already a shelf.', { icon: 'info' });
  actionSheet({ title: 'Which sector?', items: opts.slice(0, 20).map(j => ({ label: j.name, sub: plural(j.members.length, 'link'), run: () => { store.setSetting('shelves', normShelves(store.getSetting('shelves').concat({ job: j.id }))); toast(j.name + ' is on Home.', { icon: 'check' }); if (after) after(); } })) });
}
app.open.addShelf = addShelf;

// ---------- customize ----------
function customize() {
  return dialog((box, done) => {
    box.classList.add('form');
    const draw = () => {
      const L = normHome(store.getSetting('home')), save = next => { store.setSetting('home', normHome(next)); draw(); };
      box.replaceChildren(h('h3', 'Customize Home'), h('p.dim.small', 'Show, hide and reorder the tiles. Search always stays on top.'),
        h('div.stack', { style: { gap: '8px' } }, L.order.map((id, i) => {
          const t = TILES.find(x => x.id === id), on = !L.hide.includes(id);
          const move = d => { const o = L.order.slice(); [o[i], o[i + d]] = [o[i + d], o[i]]; save({ ...L, order: o }); };
          return h('div.set.cz', h('div.grow', h('div.lab', t.label), h('div.sub', t.sub)),
            btn('', { cls: 'icon xs ghost', icon: 'up', title: 'Move up', disabled: i === 0, onclick: () => move(-1) }), btn('', { cls: 'icon xs ghost', icon: 'down', title: 'Move down', disabled: i === L.order.length - 1, onclick: () => move(1) }),
            h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Show ' + t.label, onclick: () => save({ ...L, hide: on ? L.hide.concat(id) : L.hide.filter(x => x !== id) }) }));
        })),
        h('h4', { style: { margin: '14px 0 4px' } }, 'Shelves'), h('p.dim.small', 'Pin up to ' + MAX_SHELVES + ' sectors to Home. Each shows its links as launch buttons.'),
        h('div.stack', { style: { gap: '8px' } }, shelves().map(j => h('div.set.cz', h('div.grow', h('div.lab', j.name), h('div.sub', plural(j.members.length, 'link'))), btn('Remove', { cls: 'xs', onclick: () => { store.setSetting('shelves', normShelves(store.getSetting('shelves')).filter(x => x.job !== j.id)); draw(); } }))),
          shelves().length < MAX_SHELVES ? btn('Add a shelf', { cls: 'sm', icon: 'plus', onclick: () => addShelf(draw) }) : null),
        h('div.dlg-actions', btn('Done', { cls: 'pri', onclick: () => done(true) })));
    };
    draw();
  }, 'form');
}

store.on('change', redraw); store.on('load', redraw);
store.on('settings', e => { if (e && (e.key === 'home' || e.key === 'weekly' || e.key === 'shelves')) redraw(); });
app.open.home = openHome;
app.open.homeGo = id => { openHome(); setTimeout(() => goTo(id), 500); };
app.open.homeSearch = () => { openHome(); setTimeout(() => { const p = getPanel('home'); if (p && p._input) p._input.focus(); }, 450); };
