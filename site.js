'use strict';

(() => {
  const topbar = document.querySelector('.topbar');
  const update = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  update();
  new ResizeObserver(update).observe(topbar);
})();

// Manual carousels keep the offer readable and keep hidden links out of keyboard navigation.
function setupCarousel(rootSelector, slideSelector, dotSelector, trackSelector) {
  const root = document.querySelector(rootSelector);
  const slides = [...root.querySelectorAll(slideSelector)];
  const dots = [...root.querySelectorAll(dotSelector)];
  const track = trackSelector && root.querySelector(trackSelector);
  let index = 0;
  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.setAttribute('aria-current', String(i === index));
    });
    if (track) track.style.transform = `translateX(-${index * 100}%)`;
    root.querySelectorAll('.master-bg-slide').forEach((bg, i, backgrounds) => {
      bg.classList.toggle('is-active', i === index % backgrounds.length);
    });
  }
  root.querySelector('.prev').addEventListener('click', () => show(index - 1));
  root.querySelector('.next').addEventListener('click', () => show(index + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i)));
  root.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  let start = null;
  let suppressClick = false;
  root.addEventListener('touchstart', event => {
    start = event.touches.length === 1 ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null;
    suppressClick = false;
  }, {passive: true});
  root.addEventListener('touchmove', event => {
    if (!start || event.touches.length !== 1) {start = null; return;}
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
      event.preventDefault();
      suppressClick = true;
    }
  }, {passive: false});
  root.addEventListener('touchend', event => {
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    start = null;
  }, {passive: true});
  root.addEventListener('touchcancel', () => {start = null; suppressClick = false;}, {passive: true});
  root.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
  show(0);
}
setupCarousel('.hero-carousel', '.hero-slide', '.hero-dot', '.hero-slides');
setupCarousel('.master-carousel', '.master-slide', '.master-dot');

// These goals record intent; a DIKIDI link click is not a completed appointment.
(() => {
  const overlay = document.getElementById('booking-overlay');
  let navigationTimer;
  let fallbackTimer;
  const hide = () => {
    clearTimeout(navigationTimer);
    clearTimeout(fallbackTimer);
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
  };
  const track = event => {
    if (event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    const booking = url.hostname === 'dikidi.net' && url.pathname === '/2038825';
    const goal = booking ? 'booking_click' : url.protocol === 'tel:' ? 'phone_click' : url.hostname === 'wa.me' ? 'whatsapp_click' : null;
    if (!goal) return;
    const section = link.closest('section');
    const params = {placement: section?.id || (section?.classList.contains('hero-carousel') ? 'hero' : link.closest('.mobile-bar') ? 'mobile_bar' : 'header'), master_id: url.searchParams.get('m') || '', service: link.closest('.service-row')?.id || ''};
    try {if (typeof window.ym === 'function') window.ym(113129252, 'reachGoal', goal, params);} catch (_) { /* Analytics must never prevent navigation. */ }
    if (!booking || event.type !== 'click' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
    event.preventDefault();
    hide();
    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');
    navigationTimer = setTimeout(() => {window.location.assign(url.href);}, 550);
    fallbackTimer = setTimeout(hide, 4550);
  };
  document.addEventListener('click', track);
  document.addEventListener('auxclick', track);
  overlay.addEventListener('click', hide);
  document.addEventListener('keydown', event => {if (event.key === 'Escape') hide();});
  window.addEventListener('pageshow', hide);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) hide();});
})();

(() => {
  const box = document.getElementById('lightbox');
  const image = document.getElementById('lightbox-img');
  const closeButton = box.querySelector('button');
  const selector = '.portfolio-photo, .review-photo-full';
  let trigger = null;
  let previousOverflow = '';
  let scale = 1, x = 0, y = 0;
  let pan = null, pinch = null, moved = false, lastTap = 0;
  const pointers = new Map();
  const backgrounds = [...document.body.children].filter(el => el !== box && el.tagName !== 'SCRIPT');
  const previousInert = new Map();
  const active = () => box.classList.contains('is-active');
  function apply() {
    const maxX = Math.max(0, (image.offsetWidth * scale - box.clientWidth + 48) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - box.clientHeight + 128) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }
  function reset() {scale = 1; x = y = lastTap = 0; pointers.clear(); pan = pinch = null; moved = false; apply();}
  function zoom(next, clientX, clientY) {
    const rect = image.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const nextScale = Math.min(4, Math.max(1, next));
    x -= dx * (nextScale / scale - 1);
    y -= dy * (nextScale / scale - 1);
    scale = nextScale;
    if (scale === 1) x = y = 0;
    apply();
  }
  function open(img) {
    trigger = img;
    reset();
    image.src = img.currentSrc || img.src;
    image.alt = img.alt;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.classList.add('is-active');
    box.setAttribute('aria-hidden', 'false');
    closeButton.focus();
    backgrounds.forEach(el => {previousInert.set(el, el.inert); el.inert = true;});
  }
  function close() {
    if (!active()) return;
    backgrounds.forEach(el => {el.inert = previousInert.get(el);});
    previousInert.clear();
    document.body.style.overflow = previousOverflow;
    trigger?.focus({preventScroll: true});
    box.classList.remove('is-active');
    box.setAttribute('aria-hidden', 'true');
    reset();
  }
  closeButton.addEventListener('click', close);
  document.addEventListener('click', event => {const img = event.target.closest(selector); if (img) open(img);});
  document.addEventListener('keydown', event => {
    if (active()) {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {event.preventDefault(); closeButton.focus();}
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches(selector)) {event.preventDefault(); open(event.target);}
  });
  box.addEventListener('click', event => {if (event.target === box && !moved) close();});
  box.addEventListener('wheel', event => {event.preventDefault(); zoom(scale * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);}, {passive: false});
  const distance = pts => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  box.addEventListener('pointerdown', event => {
    if (event.target === closeButton || !active()) return;
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (event.target === image) image.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      pinch = {distance: Math.max(1, distance([...pointers.values()])), scale};
      pan = null; moved = true;
    } else pan = {x: event.clientX, y: event.clientY, tx: x, ty: y};
  });
  box.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const pts = [...pointers.values()];
    if (pinch && pts.length >= 2) {
      zoom(pinch.scale * distance(pts) / pinch.distance, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    } else if (pan) {
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (scale > 1) {x = pan.tx + dx; y = pan.ty + dy; apply();}
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const single = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (single && event.type === 'pointerup' && !moved && event.target === image) {
      const now = Date.now();
      if (now - lastTap < 300) {zoom(scale > 1 ? 1 : 2.5, event.clientX, event.clientY); lastTap = 0;}
      else lastTap = now;
    }
    if (pointers.size < 2) pinch = null;
    const remaining = pointers.values().next().value;
    pan = remaining ? {x: remaining.x, y: remaining.y, tx: x, ty: y} : null;
  }
  box.addEventListener('pointerup', endPointer);
  box.addEventListener('pointercancel', endPointer);
  image.addEventListener('load', apply);
  window.addEventListener('resize', apply);
})();

(() => {
  ['portfolio-strip', 'review-strip'].forEach(className => {
    const strip = document.querySelector(`.${className}`);
    const thumb = document.querySelector(`[data-track-for="${className}"]`);
    function update() {
      const track = thumb.parentElement;
      const maximum = strip.scrollWidth - strip.clientWidth;
      const width = Math.min(track.clientWidth, Math.max(24, strip.clientWidth / strip.scrollWidth * track.clientWidth));
      thumb.style.width = `${width}px`;
      thumb.style.transform = `translateX(${maximum > 0 ? strip.scrollLeft / maximum * (track.clientWidth - width) : 0}px)`;
    }
    strip.addEventListener('scroll', update, {passive: true});
    strip.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); strip.scrollLeft += event.key === 'ArrowRight' ? 200 : -200;}
    });
    new ResizeObserver(update).observe(strip);
    update();
  });
})();

(() => {
  const banner = document.getElementById('cookie-banner');
  try {if (localStorage.getItem('cookieConsentAccepted') === '1') return;} catch (_) {}
  banner.hidden = false;
  document.getElementById('cookie-accept').addEventListener('click', () => {
    try {localStorage.setItem('cookieConsentAccepted', '1');} catch (_) {}
    banner.hidden = true;
  });
})();

(() => {
  const form = document.getElementById('price-calculator');
  const total = document.getElementById('calculator-total');
  const count = document.getElementById('calculator-count');
  const brows = document.getElementById('brows-treatment');
  function update() {
    const selected = [...form.querySelectorAll('input:checked')];
    brows.disabled = !form.elements.brows.checked;
    const sum = selected.reduce((value, input) => value + Number(input.name === 'brows' ? brows.value : input.value), 0);
    total.textContent = sum ? `от ${new Intl.NumberFormat('ru-RU').format(sum)} ₽` : 'Выберите услугу';
    count.textContent = selected.length ? `Выбрано услуг: ${selected.length}` : 'Можно выбрать несколько услуг';
  }
  form.addEventListener('change', update);
  form.addEventListener('submit', event => event.preventDefault());
  update();
})();
