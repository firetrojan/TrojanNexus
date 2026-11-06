// ui/share.js - take things out of Nexus: copy as a task, a brief for an AI chat, notes and tables, calendar dates.
// Everything here makes text on your phone. Nothing is sent anywhere unless you tap Share, WhatsApp or Email yourself.
import { h, plural, todayISO } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import * as X from '../exporters.js';
import { app } from './app.js';
import { btn, toast, dialog, actionSheet, copyText, openLink, downloadText, canShareFiles, shareTextFile, FRAMED, TYPE_LABEL } from './kit.js';

const sizeText = t => { const n = X.estimateTokens(t); return (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n) + ' tokens, ' + t.length.toLocaleString('en') + ' characters'; };

/** The buttons under a piece of text: Copy, Share, WhatsApp, Email, Save file. getText() is read when you tap. */
export function shareRow(getText, o = {}) {
  const bits = [btn('Copy', { cls: 'pri sm', icon: 'copy', onclick: async () => { const ok = await copyText(getText()); toast(ok ? (o.copied || 'Copied.') : 'Could not copy. Long-press the text and choose Copy.', { icon: ok ? 'copy' : 'warn' }); sfx.feel(ok ? 'ok' : 'tap'); } })];
  if (typeof navigator !== 'undefined' && navigator.share) bits.push(btn('Share…', { cls: 'sm', icon: 'open', onclick: async () => { try { await navigator.share({ title: o.title || 'Nexus', text: getText() }); } catch (e) { /* closed by you */ } } }));
  if (!o.noMessage) {
    bits.push(btn('WhatsApp', { cls: 'sm', onclick: () => { const t = getText(); if (t.length > 3500) toast('That is long for a message. Copy it instead, or shorten it.', { icon: 'info' }); else openLink(X.whatsappLink(t)); } }));
    bits.push(btn('Email', { cls: 'sm', onclick: () => { const m = X.mailtoLink(o.subject || o.title || 'From Nexus', getText()); if (m.cut) toast('Cut to fit an email link. Copy it for the whole text.', { icon: 'info' }); openLink(m.href); } }));
  }
  if (o.file) bits.push(btn('Save file', { cls: 'sm', icon: 'download', onclick: () => { const ok = !FRAMED && downloadText(o.file, getText(), o.mime || 'text/plain'); toast(ok ? 'Saved as ' + o.file + '. Check your Downloads.' : 'Downloads are blocked here. Use Copy.', { icon: ok ? 'download' : 'warn', ms: 5000 }); } }));
  return h('div.share-row', bits);
}

/** A dialog with editable text and the share buttons. o: { title, hint, text, file, mime, controls:[elements], regen:()=>text } */
export function shareDialog(o) {
  return dialog((box, done) => {
    box.classList.add('form', 'shareb');
    const ta = h('textarea.ta.share-ta', { rows: 9, spellcheck: 'false' }, o.text || '');
    const info = h('p.dim.small.share-info', sizeText(ta.value));
    ta.addEventListener('input', () => { info.textContent = sizeText(ta.value); });
    o.bind && o.bind({ set: t => { ta.value = t; info.textContent = sizeText(t); }, info });
    box.append(h('h3', o.title), o.hint ? h('p', o.hint) : null, ...(o.controls || []), ta, info, shareRow(() => ta.value, { title: o.title, subject: o.subject, file: o.file, mime: o.mime, copied: o.copied, noMessage: o.noMessage }),
      h('div.dlg-actions', btn('Close', { cls: 'pri', onclick: () => done(null) })));
  });
}

// ---------- tasks for Super Productivity (or any to-do app) ----------
export function copyAsTask(items, o = {}) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean); if (!list.length) return toast('Nothing to copy.', { icon: 'info' });
  return shareDialog({ title: 'Copy as task', hint: 'Paste it into your to-do app as a new task. The first line is the task title and the rest is its note. You can edit the text first.', text: X.taskText(list, o), copied: 'Task copied. Paste it into your to-do app.', noMessage: true });
}
export function copyMissionAsTask(thread) { return shareDialog({ title: 'Copy mission as task', hint: 'One task with a checklist, one line per step.', text: X.missionTask(thread, store.byId), copied: 'Task copied. Paste it into your to-do app.', noMessage: true }); }

// ---------- calendar ----------
/** events: [{rid, kind, date, title, details, url}] from exporters.upcomingEvents or a single hand-made one. */
export function addToCalendar(events) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean); if (!list.length) return toast('No dates to add yet.', { icon: 'info' });
  const items = [];
  if (list.length === 1) items.push({ label: 'Google Calendar', sub: list[0].title, icon: 'open', run: () => openLink(X.gcalLink(list[0])) });
  items.push({ label: 'Calendar file (.ics)', sub: plural(list.length, 'date') + '. Opens in any calendar app.', icon: 'download', run: () => {
    const text = X.icsFor(list), name = list.length === 1 ? 'nexus-' + list[0].date + '.ics' : 'nexus-dates-' + todayISO() + '.ics';
    const ok = !FRAMED && downloadText(name, text, 'text/calendar');
    if (ok) toast('Saved as ' + name + '. Open it to add the dates.', { icon: 'download', ms: 5000 });
    else shareDialog({ title: 'Calendar file text', hint: 'Downloads are blocked here. Copy this text into a file called ' + name + ' and open it.', text, noMessage: true, copied: 'Copied.' });
  } });
  if (canShareFiles()) items.push({ label: 'Share calendar file…', sub: 'Send it to your calendar app', icon: 'open', run: async () => {
    const r = await shareTextFile('nexus-dates-' + todayISO() + '.ics', X.icsFor(list), 'text/calendar', 'Nexus dates');
    if (r === 'failed') toast('Sharing did not work here. Use the .ics file option instead.', { icon: 'info' });
  } });
  return actionSheet({ title: 'Add to calendar', items });
}
/** The dates one resource has: next check, limit reset, trial end. */
export function eventsOf(r) { return X.upcomingEvents([r], { from: '2000-01-01', days: 40000 }); }

// ---------- brief for an AI chat ----------
export function briefDialog() {
  const sectors = store.state.jobs.filter(j => j.members.length);
  const scope = h('select.sel', h('option', { value: '' }, 'All my resources'), sectors.map(j => h('option', { value: j.id }, j.name + ' (' + j.members.length + ')')));
  const detail = h('select.sel', h('option', { value: 'short' }, 'Short (a line each)'), h('option', { value: 'full' }, 'Full (more lines, notes)'));
  const links = h('select.sel', h('option', { value: '' }, 'No (safer)'), h('option', { value: '1' }, 'Yes, include web addresses'));
  let api = null;
  const make = () => X.aiBrief(store.state, { jobId: scope.value, detail: detail.value, links: !!links.value, custom: store.customFields() });
  const regen = () => { const b = make(); if (api) { api.set(b.text); api.info.textContent = b.count + ' resources' + (b.left ? ' (' + b.left + ' left out to keep it short)' : '') + ' · ' + sizeText(b.text); } };
  [scope, detail, links].forEach(x => x.addEventListener('change', regen));
  const first = make();
  const box = shareDialog({ title: 'Brief for an AI chat', hint: 'Paste this at the start of a chat with any AI. It will then answer from your own resources. Instagram follows are left out, and so are web addresses unless you choose them.',
    text: first.text, copied: 'Brief copied. Paste it into your AI chat.', noMessage: true, file: 'nexus-brief.txt', bind: a => { api = a; a.info.textContent = first.count + ' resources' + (first.left ? ' (' + first.left + ' left out)' : '') + ' · ' + sizeText(first.text); },
    controls: [h('div.field', h('label', 'Which resources'), scope), h('div.field', h('label', 'How much detail'), detail), h('div.field', h('label', 'Include web addresses?'), links)] });
  return box;
}

// ---------- notes and tables ----------
export function exportNotes() { const text = X.markdownAll(store.state, { custom: store.customFields() }); return shareDialog({ title: 'Markdown notes', hint: 'All your resources as one notes file, grouped by sector. Open it in any notes app.', text, file: 'nexus-notes-' + todayISO() + '.md', mime: 'text/markdown', noMessage: true, copied: 'Notes copied.' }); }
export function exportTable() { const text = X.csvAll(store.state, { custom: store.customFields() }); return shareDialog({ title: 'Table (CSV)', hint: 'One row per resource. Opens in Sheets or Excel. Cells that start with = + - or @ get a quote mark in front so they cannot run as formulas.', text, file: 'nexus-table-' + todayISO() + '.csv', mime: 'text/csv', noMessage: true, copied: 'Table copied.' }); }
export function exportCalendar() { return addToCalendar(X.upcomingEvents(store.state.resources, { days: 90 })); }

app.open.copyTask = copyAsTask; app.open.brief = briefDialog; app.open.addToCalendar = addToCalendar; app.open.exportCalendar = exportCalendar;
export { TYPE_LABEL };
