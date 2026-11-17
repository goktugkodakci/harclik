import { h } from './dom.js';

const DEFAULT_DURATION_MS = 3500;
const ACTION_DURATION_MS = 6000;

let hideTimer = null;

function region() {
  return document.getElementById('toasts');
}

function hideToast() {
  clearTimeout(hideTimer);
  region().replaceChildren();
}

export function showToast(message, { action = null, tone = 'info', duration = null } = {}) {
  const toast = h(
    'div',
    { class: 'toast', 'data-tone': tone, role: tone === 'error' ? 'alert' : null },
    h('span', { class: 'toast-text' }, message),
    action
      ? h('button', {
        type: 'button',
        class: 'toast-action',
        onClick: () => {
          hideToast();
          action.run();
        }
      }, action.label)
      : null
  );
  region().replaceChildren(toast);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideToast, duration ?? (action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS));
}
