// Minimal inline toast for pages that don't load the main JS bundle (login, add-server).
// Reuses the .cs-toast CSS classes from panel.css.
(() => {
  if (!document.getElementById('cs-toast-container')) {
    const el = document.createElement('div');
    el.id = 'cs-toast-container';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  window.showToast = (msg, type) => {
    const t = document.createElement('div');
    t.className = `cs-toast cs-toast--${type}`;
    t.textContent = msg;
    document.getElementById('cs-toast-container').appendChild(t);
    requestAnimationFrame(() => {
      t.classList.add('cs-toast--visible');
    });
    setTimeout(() => {
      t.classList.remove('cs-toast--visible');
      setTimeout(() => {
        t.remove();
      }, 220);
    }, 3000);
  };
})();
