// ui/rules.js - the rule editor for smart sectors: "Type is AI and Cost is not Paid". Shows how many resources match as you build it.
import { h, plural, todayISO } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as R from '../rules.js';
import { app } from './app.js';
import { btn, dialog, segmented, TYPE_LABEL, STATUS_LABEL, CAD_LABEL } from './kit.js';

/** The labels the rule words need, taken from the screens. */
export const ruleCtx = () => ({
  types: store.TYPES.map(v => ({ v, l: TYPE_LABEL[v] })), statuses: store.STATUSES.map(v => ({ v, l: STATUS_LABEL[v] })), cadences: store.CADENCES.map(v => ({ v, l: CAD_LABEL[v] })), custom: store.customFields()
});
export const ruleText = rule => R.describeRule(rule, ruleCtx());

const OPLABEL = { is: 'is', not: 'is not', contains: 'contains', has: 'has the tag', nohas: 'does not have the tag', filled: 'is filled in', empty: 'is empty', soon: 'is within the next … days (or passed)', older: 'was not checked for … days', yes: 'is yes', no: 'is no' };

/**
 * Open the editor. o: { rule, title }. Resolves with a clean rule, or null if cancelled.
 * The current members of an existing sector are not shown here; only how many resources the rule would hold.
 */
export function editRule(o = {}) {
  const ctx = ruleCtx(), fields = R.ruleFields(ctx), byKey = new Map(fields.map(f => [f.key, f]));
  return dialog((box, done) => {
    box.classList.add('form', 'rules');
    let rule = R.normRule(o.rule) || { match: 'all', conds: [{ f: 'type', op: 'is', v: store.TYPES[0] }] };
    const rowsEl = h('div.rrows'), preview = h('p.dim.small.rprev'), start = h('div.chips.scrollx');
    const fix = c => {   // keep operator and value valid when the field or operator changes
      const f = byKey.get(c.f) || fields[0]; c.f = f.key;
      const ops = R.opsFor(f.kind); if (!ops.includes(c.op)) c.op = ops[0];
      if (R.needsValue(c.op)) {
        if (f.kind === 'choice' && c.op !== 'soon') { if (!f.options.some(x => x.v === c.v)) c.v = f.options[0] ? f.options[0].v : ''; }
        else if (c.op === 'soon' || c.op === 'older') { if (!/^\d+$/.test(c.v)) c.v = c.op === 'soon' ? '7' : '30'; }
        else if (typeof c.v !== 'string') c.v = '';
      } else c.v = '';
    };
    const current = () => R.normRule(rule);
    const showPreview = () => {
      const r = current(); if (!r) { preview.textContent = 'Add at least one condition. A value is needed for most of them.'; return; }
      const hits = store.state.resources.filter(x => R.matches(x, r, todayISO()));
      preview.textContent = plural(hits.length, 'resource') + ' match now' + (hits.length ? ': ' + hits.slice(0, 3).map(x => x.title.length > 22 ? x.title.slice(0, 21) + '…' : x.title).join(', ') + (hits.length > 3 ? '…' : '') : '. A sector made from this rule would be empty.');
    };
    const draw = () => {
      rule.conds.forEach(fix);
      rowsEl.replaceChildren(...rule.conds.map((c, i) => {
        const f = byKey.get(c.f);
        const fsel = h('select.sel', { 'aria-label': 'Field', onchange: e => { c.f = e.target.value; c.v = ''; fix(c); draw(); } }, fields.map(x => h('option', { value: x.key, selected: x.key === c.f }, x.label)));
        const osel = h('select.sel', { 'aria-label': 'Condition', onchange: e => { c.op = e.target.value; if (c.op === 'soon' || c.op === 'older') c.v = ''; fix(c); draw(); } }, R.opsFor(f.kind).map(op => h('option', { value: op, selected: op === c.op }, OPLABEL[op])));
        let val = null;
        if (R.needsValue(c.op)) {
          if (f.kind === 'choice' && c.op !== 'soon') val = h('select.sel', { 'aria-label': 'Value', onchange: e => { c.v = e.target.value; showPreview(); } }, f.options.map(x => h('option', { value: x.v, selected: x.v === c.v }, x.l)));
          else val = h('input.in', { type: (c.op === 'soon' || c.op === 'older') ? 'number' : 'text', inputmode: (c.op === 'soon' || c.op === 'older') ? 'numeric' : 'text', min: '0', max: '3650', value: c.v, placeholder: c.op === 'has' || c.op === 'nohas' ? 'tag' : (c.op === 'contains' ? 'word' : 'days'), autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Value', oninput: e => { c.v = e.target.value; showPreview(); } });
        }
        return h('div.rrow', fsel, osel, val, rule.conds.length > 1 ? btn('', { cls: 'xs icon ghost', icon: 'close', title: 'Remove this condition', onclick: () => { rule.conds.splice(i, 1); draw(); } }) : null);
      }));
      showPreview();
    };
    const modeBox = h('div'), drawMode = () => modeBox.replaceChildren(segmented([{ v: 'all', l: 'All of these' }, { v: 'any', l: 'Any of these' }], rule.match, v => { rule.match = v; showPreview(); }, { instant: true }));
    start.append(...R.PRESETS.map(p => h('button.chip.t', { type: 'button', onclick: () => { rule = JSON.parse(JSON.stringify(p.rule)); drawMode(); draw(); } }, p.label)));
    box.append(h('h3', o.title || 'Fill this sector by a rule'), h('p', 'The sector keeps itself up to date. Anything that matches appears in it, and leaves it when it stops matching.'),
      h('div.field', h('label', 'Start from'), start), h('div.field', h('label', 'Match'), modeBox), h('div.field', h('label', 'Conditions'), rowsEl, btn('Add a condition', { cls: 'sm', icon: 'plus', onclick: () => { if (rule.conds.length >= 8) return; rule.conds.push({ f: 'tag', op: 'has', v: '' }); fix(rule.conds[rule.conds.length - 1]); draw(); } })), preview,
      h('div.dlg-actions', btn('Cancel', { onclick: () => done(null) }), btn(o.ok || 'Save rule', { cls: 'pri', onclick: () => { const r = current(); if (!r) { showPreview(); return; } done(r); } })));
    drawMode(); draw();
  });
}
app.open.editRule = editRule;
void icon;
