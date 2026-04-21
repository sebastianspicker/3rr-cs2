// Minimal inline toast for pages that don't load the main JS bundle (login, add-server).
// Reuses the .cs-toast CSS classes from panel.css.
(function () {
  if (!document.getElementById('cs-toast-container')) {
    var el = document.createElement('div');
    el.id = 'cs-toast-container';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  window.showToast = function (msg, type) {
    var t = document.createElement('div');
    t.className = 'cs-toast cs-toast--' + type;
    t.textContent = msg;
    document.getElementById('cs-toast-container').appendChild(t);
    requestAnimationFrame(function () {
      t.classList.add('cs-toast--visible');
    });
    setTimeout(function () {
      t.classList.remove('cs-toast--visible');
      setTimeout(function () {
        t.remove();
      }, 220);
    }, 3000);
  };
})();
