import { h, prefersReducedMotion } from './dom.js';

// Fallback in case animationend never fires (tab hidden mid-animation).
const CLOSE_FALLBACK_MS = 320;

// Bottom sheet shell shared by the entry and plan sheets: modal <dialog>, slide in/out,
// closes on backdrop tap or Escape, and puts focus somewhere sensible afterwards.
export function openSheet({ label, content, onKeydown = null }) {
  const opener = document.activeElement;
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': label, tabindex: '-1' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    content
  );

  let closing = false;
  function close() {
    if (closing) {
      return;
    }
    closing = true;
    const finish = () => {
      if (!dialog.isConnected) {
        return;
      }
      dialog.close();
      dialog.remove();
      // Saving re-renders the page, so whatever opened the sheet may be gone. Safari does not
      // focus buttons on tap either, so the opener is often <body>; fall back to <main>.
      const usable = opener instanceof HTMLElement && opener !== document.body && opener.isConnected;
      const target = usable ? opener : document.querySelector('main');
      target?.focus({ preventScroll: true });
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    dialog.classList.add('is-closing');
    dialog.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, CLOSE_FALLBACK_MS);
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return;
    }
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) {
      close();
    }
  });
  if (onKeydown) {
    dialog.addEventListener('keydown', onKeydown);
  }

  document.body.append(dialog);
  dialog.showModal();
  // The sheet itself takes focus: a focused button would swallow Enter, and a focused text
  // field would pop up the iPhone keyboard.
  dialog.focus();
  return { dialog, close };
}
