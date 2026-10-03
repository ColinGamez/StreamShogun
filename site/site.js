(() => {
  'use strict';

  document.documentElement.classList.add('js-ready');
  const releaseUrl = 'https://github.com/ColinGamez/StreamShogun/releases/latest';
  const apiBase = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:3001/api'
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
    modal.hidden = false;
    modal.querySelector('button')?.focus();
  };
  const hideModal = () => { if (modal) modal.hidden = true; };
  modal?.querySelector('[data-modal-close]')?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) hideModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideModal(); });

  const csrfToken = () => document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)?.[1] || '';
  checkout?.addEventListener('click', async () => {
    checkout.setAttribute('aria-busy', 'true');
    try {
      const me = await fetch(`${apiBase}/v1/me`, { credentials: 'include', headers: { 'x-client': 'web' } });
      if (!me.ok) return showModal();
      const response = await fetch(`${apiBase}/v1/billing/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-client': 'web', 'X-CSRF-Token': decodeURIComponent(csrfToken()) },
        body: JSON.stringify({ interval: checkout.dataset.interval || 'monthly' }),
      });
      const payload = await response.json();
      if (payload.url) location.assign(payload.url); else showModal();
    } catch { showModal(); }
    finally { checkout.removeAttribute('aria-busy'); }
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
