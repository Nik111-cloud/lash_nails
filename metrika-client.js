// Resolve the current counter ID; localStorage is a cache, not a CRM record.
(() => {
  const counterId = 113129252;
  const storageKey = 'yandex_client_id';
  const whatsappLinks = [...document.querySelectorAll('a[href]')]
    .filter(link => new URL(link.href).hostname === 'wa.me')
    .map(link => ({link, original: link.href}));
  let pending = null;

  function updateWhatsApp(clientId) {
    whatsappLinks.forEach(({link, original}) => {
      const url = new URL(original);
      if (clientId) {
        const message = url.searchParams.get('text') || 'Здравствуйте! Хочу записаться.';
        url.searchParams.set('text', `${message}\nКод обращения: ${clientId}`);
      }
      link.href = url.href;
    });
  }

  function requestClientId() {
    if (pending) return pending;
    pending = new Promise(resolve => {
      let finished = false;
      let retry;
      const finish = clientId => {
        if (finished) return;
        finished = true;
        clearTimeout(retry);
        clearTimeout(timeout);
        const id = typeof clientId === 'string' && /^\d+$/.test(clientId) ? clientId : null;
        try {
          if (id) localStorage.setItem(storageKey, id);
          else localStorage.removeItem(storageKey);
        } catch (_) { /* Storage may be disabled; the ID is still usable in memory. */ }
        updateWhatsApp(id);
        resolve(id);
      };
      const timeout = setTimeout(() => finish(null), 8000);
      const attempt = () => {
        if (typeof window.ym !== 'function') {
          retry = setTimeout(attempt, 100);
          return;
        }
        try {
          // The standard Metrica stub queues this until the counter is ready.
          window.ym(counterId, 'getClientID', finish);
        } catch (_) { finish(null); }
      };
      attempt();
    });
    const request = pending;
    request.then(() => { if (pending === request) pending = null; });
    return request;
  }

  // Callers can await this Promise or pass a callback. Missing Metrica returns null.
  window.getYandexClientID = callback => {
    const request = requestClientId();
    if (typeof callback === 'function') request.then(callback);
    return request;
  };
  requestClientId();
  window.addEventListener('pageshow', event => {
    if (event.persisted) requestClientId();
  });
})();
