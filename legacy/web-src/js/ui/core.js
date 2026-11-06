// ui/core.js - Profile: your level, badges, appearance and settings, backup / import and the how-to.
import { h, todayISO, fmtDate, plural } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { parseAny } from '../importers.js';
import { currentInstall } from './install.js';
import { app } from './app.js';
import { webStatus } from './scan.js';
import { READER_DEFAULT } from '../lookup.js';
import * as snap from '../snap.js';
import { KIND_LABEL, keyFor } from '../fields.js';
import { briefDialog, exportNotes, exportTable, exportCalendar } from './share.js';
import { offerUndo } from './safety.js';
import { openPanel, getPanel, btn, chip, ico, toast, confirmBox, promptBox, actionSheet, dialog, copyText, segmented, downloadText, canShareFiles, shareTextFile, FRAMED, TYPE_LABEL } from './kit.js';

import { NEWS, VERSION } from '../whatsnew.js';
export function openWhatsNew() {
  return openPanel('whatsnew', { kind: 'overlay', title: "What's new", live: false, render: p => {
    p.setActions(btn('Done', { cls: 'ghost bold', onclick: () => p.close() }));
    p.body.replaceChildren(h('div.stack', NEWS.map(n => h('div.card', h('div.grow', h('div.row', h('b', 'Version ' + n.v.replace(/^v/, '')), h('span.grow'), h('span.dim.small', n.date)),
      h('ul.news', n.items.map(t => h('li', t))))))));
  } });
}
export function openCore() { return openPanel('core', { kind: 'view', title: 'Profile', back: true, render: draw }); }
const setting = (label, sub, on, fn) => h('div.set', h('div.grow', h('div.lab', label), sub ? h('div.sub', sub) : null), h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: e => { const b = e.currentTarget, v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); fn(v); sfx.feel('tap'); } }));
const act = (label, ic, color, fn, o = {}) => h('button', { type: 'button', class: 'set act' + (o.danger ? ' danger' : ''), onclick: fn }, h('span.mono-ic', { style: { '--c': color, '--s': '30px' }, html: icon(ic) }), h('span.grow', label, o.sub ? h('div.sub', o.sub) : null), h('span.ico-s.chev', { html: icon('fwd', 'sm') }));

const download = (name, text) => downloadText(name, text, 'application/json');
async function exportBackup(mode) {
  const text = JSON.stringify(store.exportData(), null, 1), name = 'nexus-backup-' + todayISO() + '.json';
  if (mode === 'copy') { const ok = await copyText(text); toast(ok ? 'Backup copied. Paste it into a note or message to yourself.' : 'Could not copy. Use Download instead.', { icon: ok ? 'copy' : 'warn' }); if (ok) mark(); return; }
  if (mode === 'share') {
    const r = await shareTextFile(name, text, 'application/json', 'Nexus backup');
    if (r === 'shared') { toast('Backup shared. Pick Drive, email or a chat with yourself, so a copy lives off this phone.', { icon: 'download', ms: 6000 }); mark(); return; }
    if (r === 'cancelled') return;
    toast('Sharing did not work here, so the file is being downloaded instead.', { icon: 'info' });
  }
  const ok = download(name, text);
  toast(ok ? 'Backup saved as ' + name + '. Check your Downloads.' : 'Download was blocked here. Use "Copy backup" instead.', { icon: ok ? 'download' : 'warn', ms: 6000 });
  if (ok) mark();
}
function mark() { store.state.game.lastBackup = todayISO(); game.award('backup', 1, 'Backup'); }

async function restoreFromText(text) {
  let obj; try { obj = JSON.parse(text); } catch (e) { return toast('That is not valid JSON.', { icon: 'warn' }); }
  const pv = store.previewBackup(obj); if (!pv.ok) return toast(pv.error, { icon: 'warn' });
  const items = [{ label: 'Merge: add what is missing', sub: plural(pv.resources, 'resource') + (pv.jobs ? ', ' + plural(pv.jobs, 'sector') : '') + ' found. Your current data stays.', icon: 'layers', run: () => { const r = store.importBackup(obj, 'merge'); game.award('import', r.added, 'Backup merged'); if (r.added) offerUndo('Before merging a backup', r.added + ' added, ' + r.skipped + ' already here.'); else toast(r.added + ' added, ' + r.skipped + ' already here.', { icon: 'check' }); } }];
  if (pv.full) items.push({ label: 'Replace everything', sub: 'Your current data is replaced by this backup.', icon: 'trash', danger: true, run: async () => { if (await confirmBox({ title: 'Replace all data?', text: 'Everything now in this browser is replaced. Export a backup first if unsure.', ok: 'Replace', danger: true })) { store.importBackup(obj, 'replace'); offerUndo('Before restoring a backup', 'Backup restored.'); } } });
  actionSheet({ title: 'Import backup', items });
}
function pickFile() {
  const inp = h('input', { type: 'file', accept: '.json,.html,.htm,.txt,.csv,application/json,text/html,text/plain', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    let text = ''; try { text = await f.text(); } catch (e) { return toast('Could not read that file.', { icon: 'warn' }); }
    const pr = parseAny(text);
    if (pr.format === 'backup' || (pr.format === 'json-other')) return restoreFromText(text);
    app.open.import({ name: f.name, text });
  });
  document.body.appendChild(inp); inp.click();
}

/** Add, change or remove the facts you track yourself ("Renewal day", "Best for"). Resolves when the dialog closes. */
export function manageFields() {
  const typeOpts = (keep) => [{ v: '', l: 'All types' }, ...store.TYPES.map(t => ({ v: t, l: TYPE_LABEL[t] })), ...(keep ? [{ v: '*', l: 'Keep as it is (several types)' }] : [])];
  async function editField(f) {
    const v = await promptBox({ title: f ? 'Change field' : 'New field', text: 'A fact you want to write down for resources, like a renewal day or who recommended it.', ok: f ? 'Save' : 'Add', fields: [
      { key: 'label', label: 'Name', value: f ? f.label : '', placeholder: 'e.g. Renewal day' },
      { key: 'kind', label: 'What kind of answer', type: 'select', value: f ? f.kind : 'text', options: Object.entries(KIND_LABEL).map(([k, l]) => ({ v: k, l })) },
      { key: 'options', label: 'Choices (only for Choice: one per line)', type: 'textarea', rows: 3, value: f ? f.options.join('\n') : '', placeholder: 'Daily\nWeekly' },
      { key: 'type', label: 'Show it for', type: 'select', value: f ? (f.types.length > 1 ? '*' : (f.types[0] || '')) : '', options: typeOpts(f && f.types.length > 1) }] });
    if (!v) return false;
    const label = v.label.trim(); if (!label) { toast('Give the field a name.', { icon: 'warn' }); return false; }
    const options = v.options.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
    if (v.kind === 'choice' && !options.length) { toast('A Choice field needs at least one choice.', { icon: 'warn' }); return false; }
    const list = store.customFields().filter(x => !f || x.key !== f.key);
    const entry = { key: f ? f.key : keyFor(label), label, kind: v.kind, options, types: v.type === '*' ? f.types : (v.type ? [v.type] : []) };
    store.setSetting('customFields', f ? store.customFields().map(x => x.key === f.key ? entry : x) : [...list, entry]);
    if (!store.customFields().some(x => x.key === entry.key)) { toast('That name is already used by another field, or there are already 12.', { icon: 'warn', ms: 5000 }); return false; }
    sfx.feel('ok'); return true;
  }
  return dialog((box, done) => {
    box.classList.add('form');
    const list = h('div.stack');
    const draw = () => {
      const fs = store.customFields();
      list.replaceChildren(...(fs.length ? fs.map(f => h('div.card.fcard', h('div.grow', h('div.t', f.label), h('div.s', KIND_LABEL[f.kind] + (f.kind === 'choice' ? ': ' + f.options.join(', ') : '') + ' · ' + (f.types.length ? f.types.map(t => TYPE_LABEL[t]).join(', ') : 'all types'))),
        btn('Edit', { cls: 'xs', onclick: async () => { await editField(f); draw(); } }),
        btn('', { cls: 'xs icon ghost', icon: 'trash', title: 'Delete ' + f.label, onclick: async () => {
          if (!(await confirmBox({ title: 'Delete "' + f.label + '"?', text: 'The field goes away. What you already wrote in it stays saved but hidden, and comes back if you add a field with the same name.', ok: 'Delete', danger: true }))) return;
          store.setSetting('customFields', store.customFields().filter(x => x.key !== f.key)); draw();
        } }))) : [h('p.dim.small', 'No fields of your own yet. Ideas: Renewal day, Best for, Who recommended it.')]));
    };
    box.append(h('h3', 'Your own fields'), h('p', 'These appear in the edit form of every resource they apply to. You can use them in smart sector rules and they are included in exports.'), list,
      store.customFields().length < 12 ? btn('Add a field', { cls: 'sm', icon: 'plus', onclick: async () => { await editField(null); draw(); } }) : h('p.dim.small', 'You have 12 fields. That is the limit.'),
      h('div.dlg-actions', btn('Done', { cls: 'pri', onclick: () => done(true) })));
    draw();
  });
}

function when(ms) { const d = new Date(ms), t = new Date(); return (d.toDateString() === t.toDateString() ? 'today' : d.toLocaleDateString('en', { day: 'numeric', month: 'short' })) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }); }

function draw(p) {
  const pr = game.progress(), st = store.stats(), g = store.state.game, theme = store.getSetting('theme');
  p.setActions();
  const badges = game.BADGES.map(b => h('div.badge' + (g.badges && g.badges[b.id] ? '.on' : ''), h('span.ico-s', { html: icon(g.badges && g.badges[b.id] ? 'trophy' : 'lock') }), h('b', b.name), h('small', b.desc)));
  const safetyRow = act('Safety copies', 'lock', 'var(--teal)', () => app.open.snapshots(), { sub: 'Checking…' }), storeLine = h('p.foot', '');
  Promise.all([snap.available(), snap.list(), snap.storageInfo()]).then(([ok, l, info]) => {
    const sub = safetyRow.querySelector('.sub'); if (sub) sub.textContent = ok ? (l.length ? plural(l.length, 'copy', 'copies') + ', newest ' + when(l[0].at) : 'None yet. One is saved before every import or big change.') : 'Not available in this browser mode';
    storeLine.textContent = info.persisted === true ? 'Storage: protected, the browser will not clear it when space is low.' : (info.persisted === false ? 'Storage: not protected. The browser may clear it if the phone runs very low on space. Keep a downloaded backup.' : '');
  }).catch(() => {});
  const nextBackup = g.lastBackup ? 'Last backup: ' + fmtDate(g.lastBackup) : 'No backup yet';
  const out = [];
  out.push(h('div.c-hero', h('div.lvl-big', { style: { '--p': pr.pct } }, h('b', pr.level)),
    h('div.grow', h('div.c-rank', pr.rank), h('div.dim', 'Level ' + pr.level), h('div.bar', h('i', { style: { width: pr.pct + '%' } })), h('div.dim.small', pr.into + ' / ' + pr.span + ' XP to level ' + (pr.level + 1) + ' · ' + pr.xp + ' XP total'))));
  out.push(h('div.stats', [['Resources', st.total], ['Reviewed', st.mapped + '%'], ['Active days', pr.days], ['Focus today', game.focusToday() + 'm']].map(([k, v]) => h('div.stat', h('b', v), h('span', k)))));

  out.push(h('div.sec-h', h('h3', 'Appearance')));
  out.push(h('div.group',
    h('div.set.stk', h('div.lab', 'Theme'), segmented([{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }], theme, v => { store.setSetting('theme', v); draw(p); }), h('div.sub', 'Auto follows your phone setting.')),
    h('div.set.stk', h('div.lab', 'Open on'), segmented([{ v: 'home', l: 'Home' }, { v: 'galaxy', l: 'Galaxy' }], store.getSetting('startOn') === 'galaxy' ? 'galaxy' : 'home', v => { store.setSetting('startOn', v); draw(p); }), h('div.sub', 'Home is the one-screen dashboard. Galaxy opens the 3D map. Opening the page with #galaxy on the end always starts on the map.')),
    h('div.set.stk', h('div.lab', 'Text size'), segmented([{ v: 'm', l: 'Normal' }, { v: 'l', l: 'Large' }, { v: 'xl', l: 'Larger' }], store.getSetting('textSize') || 'm', v => { store.setSetting('textSize', v); draw(p); }), h('div.sub', 'Makes the writing bigger everywhere.')),
    h('div.set.stk', h('div.lab', 'Graphics'), segmented([{ v: 'auto', l: 'Auto' }, { v: 'low', l: 'Low' }, { v: 'high', l: 'High' }], store.getSetting('quality'), v => { store.setSetting('quality', v); draw(p); }), h('div.sub', 'Auto adjusts to your phone. Choose Low if it feels slow.')),
    setting('Deep space galaxy', 'Keeps the galaxy a dark sky in Light mode, so stars can shine. Turn off for a light galaxy.', store.getSetting('space') !== false, v => store.setSetting('space', v)),
    setting('Beams to sector suns', 'Thin lines tying each resource to its sector.', store.getSetting('tethers'), v => store.setSetting('tethers', v)),
    setting('Calm mode', 'No slow auto-rotation, softer motion.', store.getSetting('calm'), v => store.setSetting('calm', v)),
    setting('Intro flight', 'Fly in from far away on start.', store.getSetting('intro'), v => store.setSetting('intro', v)),
    setting('Sound effects', 'Off by default.', store.getSetting('sound'), v => { store.setSetting('sound', v); if (v) sfx.play('ok'); }),
    setting('Vibration', 'Small taps on supported phones.', store.getSetting('haptics'), v => store.setSetting('haptics', v))));

  if ('Notification' in window) {
    out.push(h('div.sec-h', h('h3', 'Reminders')));
    out.push(h('div.group', setting('Due notice', 'Shows a notice when you open this page and checks are due. It cannot wake your phone by itself.', store.getSetting('notify'), async v => { if (v && Notification.permission !== 'granted') { try { const r = await Notification.requestPermission(); if (r !== 'granted') { store.setSetting('notify', false); toast('Notifications are blocked for this page.', { icon: 'warn' }); draw(p); return; } } catch (e) { store.setSetting('notify', false); draw(p); return; } } store.setSetting('notify', v); })));
  }

  out.push(h('div.sec-h', h('h3', 'This device')));
  out.push(h('div.group',
    act('Install as an app', 'download', 'var(--blue)', () => app.open.install(), { sub: currentInstall().title }),
    setting('Count on the app icon', 'When installed, shows how many things need you. It updates when you open Nexus or change something.', store.getSetting('badge') !== false, v => store.setSetting('badge', v)),
    setting('Site icons', 'Shows each site\'s own icon. This asks DuckDuckGo for the icon of every site you saved, so it learns your site list. Off by default.', store.getSetting('siteIcons') === true, v => { store.setSetting('siteIcons', v); store.emit('change', { kind: 'icons', ids: [] }); }),
    act('Keyboard shortcuts', 'spark', 'var(--indigo)', () => app.open.keys(), { sub: '/ search  ·  n add  ·  ? the list' })));

  out.push(h('div.sec-h', h('h3', 'Online lookup')));
  const MODE_TXT = { auto: 'Tries the site directly, then the reader service.', reader: 'Always uses the reader service. Works from a saved file.', direct: 'Only reads the site directly. Most sites block this from a saved file.' };
  const st0 = webStatus(), mode = store.getSetting('webMode') || 'auto';
  out.push(h('div.group',
    setting('Use the internet when it is there', 'The offline guess always runs. With this on, "Look at it online" also reads the real page or account.', store.getSetting('web') !== false, v => { store.setSetting('web', v); draw(p); }),
    h('div.set.stk', h('div.lab', 'How to read pages'), segmented([{ v: 'auto', l: 'Auto' }, { v: 'reader', l: 'Reader' }, { v: 'direct', l: 'Direct' }], mode, v => { store.setSetting('webMode', v); draw(p); }), h('div.sub', MODE_TXT[mode])),
    act('Reader address', 'signal', 'var(--teal)', async () => {
      const v = await promptBox({ title: 'Reader address', text: 'Advanced. The service that opens pages for Nexus. Leave empty for the default (' + READER_DEFAULT + '). Put {url} where the page address goes, or Nexus adds it at the end.', fields: [{ key: 'u', label: '', value: store.getSetting('webReader') || '', placeholder: READER_DEFAULT }], ok: 'Save' });
      if (v) { const u = v.u.trim(); if (u && !/^https:\/\//i.test(u)) return toast('The address must start with https://', { icon: 'warn' }); store.setSetting('webReader', u); draw(p); }
    }, { sub: store.getSetting('webReader') || 'Default: ' + READER_DEFAULT }),
    act('Never look up these sites', 'lock', 'var(--orange)', async () => {
      const v = await promptBox({ title: 'Never look up', text: 'One site per line, like example.com. Links on these sites are never sent anywhere.', fields: [{ key: 't', label: '', type: 'textarea', rows: 5, value: (store.getSetting('webSkip') || []).join('\n') }], ok: 'Save' });
      if (v) { store.setSetting('webSkip', v.t.split(/\r?\n/).map(x => x.trim()).filter(Boolean)); draw(p); }
    }, { sub: plural((store.getSetting('webSkip') || []).length, 'site') + ' on the list' })));
  out.push(h('p.foot', (st0.ok ? 'Ready. ' : st0.text + ' ') + 'When you look something up, its address goes to the reader service so it can open the page. Links with keys or passwords, shared files and private documents are never sent. Reading imported files does not use the internet.'));

  const cf = store.customFields();
  out.push(h('div.sec-h', h('h3', 'Your own fields')));
  out.push(h('div.group', act('Manage your fields', 'edit', 'var(--indigo)', () => manageFields().then(() => draw(p)), { sub: cf.length ? plural(cf.length, 'field') + ': ' + cf.map(f => f.label).join(', ') : 'Add facts like "Renewal day" or "Best for"' })));
  out.push(h('div.sec-h', h('h3', 'Take it with you')));
  out.push(h('div.group',
    act('Brief for an AI chat', 'chip', 'var(--purple)', () => briefDialog(), { sub: 'A short text to paste at the start of any AI chat' }),
    act('Markdown notes', 'book', 'var(--blue)', () => exportNotes(), { sub: 'Everything by sector, for any notes app' }),
    act('Table (CSV)', 'layers', 'var(--green)', () => exportTable(), { sub: 'One row per resource. Opens in Sheets or Excel.' }),
    act('Calendar dates', 'clock', 'var(--orange)', () => exportCalendar(), { sub: 'Checks, limit resets and trial ends, next 90 days' })));

  out.push(h('div.sec-h', h('h3', 'Your data')));
  if (!store.meta.persistent) out.push(h('div.hint.warn', 'This browser is not letting the page save (private window or blocked storage). Your changes will be lost when you close it. Export a backup now.'));
  if (FRAMED) out.push(h('div.hint', 'Downloads are blocked when Nexus is shown inside another page. Use "Copy backup text", paste it into a note or a message to yourself, and keep it. "Paste a backup" restores it.'));
  out.push(h('div.group',
    canShareFiles() ? act('Share backup (Drive, email, chat)', 'open', 'var(--blue)', () => exportBackup('share'), { sub: 'Best: keeps a copy off this phone' }) : null,
    FRAMED ? null : act('Download backup', 'download', 'var(--blue)', () => exportBackup('file')),
    act('Copy backup text', 'copy', 'var(--teal)', () => exportBackup('copy')),
    act('Import files', 'upload', 'var(--green)', () => app.open.import(), { sub: 'Bookmarks, Instagram following list, CSV, OPML' }),
    act('Restore a backup file', 'upload', 'var(--teal)', pickFile),
    safetyRow,
    act('Paste a backup', 'plus', 'var(--indigo)', async () => { const v = await promptBox({ title: 'Paste a backup', fields: [{ key: 't', label: '', type: 'textarea', rows: 6, placeholder: 'Backup JSON' }], ok: 'Read it' }); if (v && v.t.trim()) restoreFromText(v.t); }),
    act('Reset to the starter map', 'trash', 'var(--red)', async () => { if (await confirmBox({ title: 'Reset to the starter map?', text: 'All your changes, new resources and progress are replaced by the original starter data. Export a backup first if unsure.', ok: 'Reset', danger: true })) { store.resetToSeed(app.seed); offerUndo('Before reset', 'Reset to the starter map.'); } }, { danger: true })));
  out.push(h('p.foot', 'Everything lives in this browser on this device. ' + nextBackup + '. Back up before clearing browser data or switching phones.'), storeLine);

  out.push(h('div.sec-h', h('h3', 'Badges')));
  out.push(h('div.group.pad', h('div.badges', badges)));

  out.push(h('div.sec-h', h('h3', 'How to use')));
  out.push(h('div.group.pad', h('ol.how',
    h('li', h('b', 'Ask: '), 'tap the search bar and describe the job, like “turn a PDF into slides”. Matches light up in the galaxy.'),
    h('li', h('b', 'Add: '), 'tap + and paste a link, or open Import files for bookmarks and your Instagram following list. It guesses the topic, and can read the real page when you are online.'),
    h('li', h('b', 'Review: '), 'new items start as \u201Cto review\u201D. Open Alerts, then To review, and confirm or fix them.'),
    h('li', h('b', 'Check: '), 'give resources a schedule. Due ones show in Alerts. Tap Checked or Snooze.'),
    h('li', h('b', 'Back up: '), 'download a backup now and then. Your data lives only in this browser.'))));
  out.push(h('div.group', act('Weekly reset', 'check', 'var(--green)', () => app.open.reset(), { sub: 'A short checklist and 3 picks for the week' }), act('Insights', 'sigma', 'var(--teal)', () => app.open.insights(), { sub: 'What you use, what you do not, how your map is balanced' })));
  out.push(h('div.group', act("What's new", 'spark', 'var(--indigo)', () => openWhatsNew(), { sub: 'Version ' + VERSION.replace(/^v/, '') + ': what changed' })));
  out.push(h('p.foot', 'Limits: this page runs from a file, so it cannot read RSS feeds. Feed links open in your browser instead. The only things that leave this device are the links you ask Nexus to look up.'));
  const n = store.state.resources.length, bytes = (() => { try { return Math.round((localStorage.getItem(store.STORAGE_KEY) || '').length / 1024); } catch (e) { return 0; } })();
  out.push(h('p.foot.center', 'Nexus · ' + plural(n, 'resource') + ', ' + plural(store.state.jobs.length, 'sector') + ', ' + plural(store.state.threads.length, 'mission') + ' · ' + bytes + ' KB saved'));
  out.push(h('p.foot.center', 'Version ' + (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev')));
  p.body.replaceChildren(h('div.c-wrap', out));
}
store.on('game', () => { const p = getPanel('core'); if (p) draw(p); });
store.on('settings', () => { const p = getPanel('core'); if (p && !p.body.contains(document.activeElement)) draw(p); });
app.open.whatsNew = openWhatsNew; app.open.core = openCore; app.open.restoreBackup = restoreFromText; app.open.manageFields = manageFields; app.open.backupNow = exportBackup;
