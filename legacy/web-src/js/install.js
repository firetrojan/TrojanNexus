// install.js - can this page be installed as an app, and what should it tell you? Pure logic: the screen passes in what the browser says.

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * { protocol, host, standalone (already running as an app), canPrompt (Chrome offered an install button) }
 * -> { kind: 'installed' | 'ready' | 'file' | 'insecure' | 'menu', title, text, steps: [text] }
 */
export function installState({ protocol = '', host = '', standalone = false, canPrompt = false } = {}) {
  if (standalone) return { kind: 'installed', title: 'Installed', text: 'Nexus is running as an app on this device.', steps: [] };
  if (protocol === 'file:') return {
    kind: 'file', title: 'This is a saved file', text: 'Chrome cannot install a file from your storage. Installing needs the app version on an https address, once. After that it also works offline.',
    steps: ['Unzip Nexus-app and put the folder on a free host (GitHub Pages, or Netlify Drop which takes the folder as it is).', 'Open that https address in Chrome.', 'Tap the menu (three dots), then Install app. Or come back here and press Install.', 'Your data stays on each device. Move it with a backup file.'] };
  if (protocol === 'http:' && !LOCAL.test(host)) return { kind: 'insecure', title: 'Needs https', text: 'Chrome only installs apps from https addresses. This one is plain http.', steps: ['Put the app on an https host, then open that address.'] };
  if (canPrompt) return { kind: 'ready', title: 'Ready to install', text: 'Chrome can install Nexus now. It opens in its own window, works offline, and can show a count on its icon.', steps: [] };
  return { kind: 'menu', title: 'Install from the Chrome menu', text: 'Chrome has not offered an Install button here. That happens when the app is already installed, or the browser is not Chrome.',
    steps: ['Open the Chrome menu (three dots).', 'Choose Install app, or Add to Home screen.', 'Open Nexus from there.'] };
}

/** The number to show on the app icon: whole, 0 to 99. */
export const badgeCount = n => Math.max(0, Math.min(99, Math.floor(+n) || 0));

/** Is this key press meant for a shortcut? Not while typing, not with Ctrl/Alt/Meta, and only the keys we use. */
export function shortcutFor(e, typing) {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return '';
  return { '/': 'search', n: 'add', N: 'add', '?': 'help' }[e.key] || '';
}
