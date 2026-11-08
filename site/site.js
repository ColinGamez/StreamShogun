(() => {
  'use strict';

  document.documentElement.classList.add('js-ready');
  const releaseUrl = 'https://github.com/ColinGamez/StreamShogun/releases/latest';
  const apiBase = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${location.origin}/api`
    : 'https://api.streamshogun.com';

  const platform = (() => {
    const value = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
    if (value.includes('win')) return 'Windows';
    if (value.includes('mac')) return 'macOS';
    if (value.includes('linux')) return 'Linux';
    return 'desktop';
  })();

  document.querySelectorAll('[data-platform-label]').forEach((node) => {
    node.textContent = platform;
  });
  document.querySelectorAll('[data-release-link]').forEach((link) => {
    link.setAttribute('href', releaseUrl);
  });

  const menuButton = document.querySelector('[data-menu-button]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const closeMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute('aria-expanded', 'false');
    mobileMenu.hidden = true;
  };
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    mobileMenu.hidden = open;
  });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  const yearlyButton = document.querySelector('[data-price="yearly"]');
  const monthlyButton = document.querySelector('[data-price="monthly"]');
  const price = document.querySelector('[data-pro-price]');
  const cadence = document.querySelector('[data-pro-cadence]');
  const billed = document.querySelector('[data-pro-billed]');
  const checkout = document.querySelector('[data-checkout]');
  const checkoutError = document.querySelector('[data-checkout-error]');
  const showCheckoutError = (message) => {
    if (!checkoutError) return;
    checkoutError.textContent = message;
    checkoutError.hidden = false;
  };

  const setBilling = (interval) => {
    const yearly = interval === 'yearly';
    monthlyButton?.setAttribute('aria-pressed', String(!yearly));
    yearlyButton?.setAttribute('aria-pressed', String(yearly));
    if (price) price.textContent = yearly ? '$5.83' : '$6.99';
    if (cadence) cadence.textContent = '/ month';
    if (billed) billed.textContent = yearly ? 'Billed $69.99 yearly · save $13.89' : 'Billed monthly';
    if (checkout) {
      checkout.dataset.interval = interval;
      checkout.textContent = yearly ? 'Start Pro yearly' : 'Start Pro monthly';
    }
  };
  monthlyButton?.addEventListener('click', () => setBilling('monthly'));
  yearlyButton?.addEventListener('click', () => setBilling('yearly'));

  const modal = document.querySelector('[data-login-modal]');
  const showModal = () => {
    if (!modal) return;
    const interval = checkout?.dataset.interval === 'yearly' ? 'yearly' : 'monthly';
    modal.querySelectorAll('a[href^="/login"], a[href^="/register"]').forEach((link) => {
      const path = link.getAttribute('href').split('?')[0];
      link.setAttribute('href', `${path}?plan=${interval}`);
    });
    modal.hidden = false;
    modal.querySelector('button')?.focus();
  };
  const hideModal = () => { if (modal) modal.hidden = true; };
  modal?.querySelector('[data-modal-close]')?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) hideModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideModal(); });

  const csrfToken = () => document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)?.[1] || '';
  let sessionRefresh;
  const getAccount = async () => {
    const options = { credentials: 'include', headers: { 'x-client': 'web' } };
    let response = await fetch(`${apiBase}/v1/me`, options);
    if (response.status === 401) {
      if (!sessionRefresh) {
        sessionRefresh = fetch(`${apiBase}/v1/auth/refresh`, {
          ...options,
          method: 'POST',
          headers: { ...options.headers, 'Content-Type': 'application/json' },
          body: '{}',
        }).finally(() => { sessionRefresh = undefined; });
      }
      const refreshed = await sessionRefresh;
      if (refreshed.ok) response = await fetch(`${apiBase}/v1/me`, options);
    }
    return response;
  };
  getAccount().then((response) => {
    if (!response.ok) return;
    document.querySelectorAll('.site-nav a[href="/login"], .mobile-menu a[href="/login"]').forEach((link) => {
      link.href = '/account';
      link.textContent = 'Account';
    });
  }).catch(() => {});
  checkout?.addEventListener('click', async () => {
    if (checkout.disabled) return;
    checkout.disabled = true;
    if (checkoutError) checkoutError.hidden = true;
    checkout.setAttribute('aria-busy', 'true');
    try {
      const me = await getAccount();
      if (me.status === 401) return showModal();
      if (!me.ok) throw new Error('Could not verify your account. Please try again.');
      const response = await fetch(`${apiBase}/v1/billing/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-client': 'web', 'X-CSRF-Token': decodeURIComponent(csrfToken()) },
        body: JSON.stringify({ interval: checkout.dataset.interval || 'monthly' }),
      });
      if (response.status === 401) return showModal();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        showCheckoutError(typeof payload.message === 'string'
          ? payload.message
          : 'Could not start checkout. Please try again.');
        return;
      }
      location.assign(payload.url);
    } catch {
      showCheckoutError('Could not connect to checkout. Please check your connection and try again.');
    }
    finally {
      checkout.disabled = false;
      checkout.removeAttribute('aria-busy');
    }
  });

  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('button');
    button?.addEventListener('click', () => {
      const next = item.getAttribute('data-open') !== 'true';
      item.setAttribute('data-open', String(next));
      button.setAttribute('aria-expanded', String(next));
    });
  });

  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
  } else {
    document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-visible'));
  }
})();
