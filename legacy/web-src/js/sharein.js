// sharein.js - turn what another app shares to Nexus (title, text, url) into text for Quick Add. Pure.
const URL_RX = /https?:\/\/[^\s<>"'`]+/i;
const trimUrl = u => String(u || '').replace(/[)\].,;:!?'"]+$/, '');
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const first = (...xs) => { for (const x of xs) { const m = URL_RX.exec(String(x || '')); if (m) return trimUrl(m[0]); } return ''; };

/**
 * search = location.search, or a URLSearchParams. Returns { text, url, title } for Quick Add, or null when nothing was shared.
 * Apps put the link in `url`, in `text`, or (Instagram, X, YouTube) in the middle of a sentence in `text`.
 */
export function parseShare(search) {
  let p; try { p = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || '')); } catch (e) { return null; }
  const title = clip(p.get('title'), 200), text = String(p.get('text') || '').slice(0, 4000), raw = String(p.get('url') || '').trim();
  if (!title && !text && !raw) return null;
  const url = /^https?:\/\//i.test(raw) ? trimUrl(raw) : first(raw, text, title);
  if (!url) { const note = clip([title, text].filter(Boolean).join(' - '), 600); return note ? { text: note, url: '', title } : null; }
  // a title is whatever text is left once the link is taken out
  const left = clip(text.split(url).join(' ').replace(/\s+([,;.!?])/g, '$1').replace(/\s*[-:|]\s*$/, ''), 120);
  const name = (title && !URL_RX.test(title) ? title : '') || (left && !URL_RX.test(left) ? left : '');
  const cleanName = name.replace(/[|]/g, '-');
  return { text: cleanName && cleanName !== url ? cleanName + ' | ' + url : url, url, title: cleanName };
}

/** App shortcuts (long-press the app icon) open the app at ?do=add, search, review or due. Anything else is ignored. */
export function parseAction(search) {
  let p; try { p = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || '')); } catch (e) { return ''; }
  const v = String(p.get('do') || '').toLowerCase();
  return ['add', 'search', 'review', 'due'].includes(v) ? v : '';
}
