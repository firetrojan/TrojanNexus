// ui/launch.js - open a resource's link and count it, so the Home launch pad learns what you use.
import * as store from '../store.js';
import { openLink } from './kit.js';

/** Open the link of a resource (or another address of it, such as its feed) and count one open. */
export function openResource(r, url) {
  if (!r) return;
  store.markOpened(r.id);
  openLink(url || r.url);
}
