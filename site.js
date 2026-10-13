'use strict';

function loadMedia(element) {
  const items = element.matches('[data-src], [data-background]') ? [element] : [...element.querySelectorAll('[data-src], [data-background]')];
  items.forEach(item => {
    if (item.dataset.src) {
      if (item.tagName === 'IMG') item.loading = 'eager';
      item.src = item.dataset.src;
      delete item.dataset.src;
    }
    if (item.dataset.background) {
      item.style.setProperty('--row-bg', `url("${item.dataset.background}")`);
      delete item.dataset.background;
    }
  });
}

// Start below-the-fold media after the first image has been painted. Native lazy
// loading may otherwise download several screens of photos on a slow connection.
(() => {
  const hero = document.querySelector('.hero-slide-photo');
  let started = false;
  function observe() {
    if (started) return;
    started = true;
    const items = document.querySelectorAll('[data-src], [data-background]');
    if (!('IntersectionObserver' in window)) {items.forEach(loadMedia); return;}
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.target.closest('[inert]')) return;
        loadMedia(entry.target);
        observer.unobserve(entry.target);
      });
    }, {rootMargin:'400px 0px',threshold:0.01});
    items.forEach(item => observer.observe(item));
  }
  // A visitor who scrolls immediately should not wait for the hero image.
  window.addEventListener('scroll', observe, {once:true,passive:true});
  hero.decode().catch(() => {}).then(() => requestAnimationFrame(() => requestAnimationFrame(observe)));
})();

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
  const animateCards = !track && root.classList.contains('master-carousel');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let cardAnimations = [];
  let cardAnimationId = 0;
  let pendingNext = null;
  let index = 0;
  let moving = false;
  let settleTimer;
  function settleTrack() {
    if (!track) return;
    clearTimeout(settleTimer);
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    slides.forEach((slide, i) => {
      const slot = (i - index + slides.length) % slides.length;
      slide.style.transform = `translateX(${(slot - i) * 100}%)`;
    });
    moving = false;
  }
  function settleCards() {
    clearTimeout(settleTimer);
    cardAnimationId += 1;
    cardAnimations.forEach(animation => animation.cancel());
    cardAnimations = [];
    slides.forEach(slide => slide.classList.remove('is-leaving'));
    root.classList.remove('is-sliding');
    moving = false;
    const queued = pendingNext;
    pendingNext = null;
    if (queued !== null) show(queued, true);
  }
  if (animateCards) motion.addEventListener('change', () => {
    if (motion.matches && moving) settleCards();
  });
  if (track) track.addEventListener('transitionend', event => {
    if (event.target === track && event.propertyName === 'transform') settleTrack();
  });
  function show(next, fromUser = false) {
    if ((track || animateCards) && moving) {
      if (animateCards && fromUser) pendingNext = next;
      return;
    }
    const previous = index;
    index = ((next % slides.length) + slides.length) % slides.length;
    const slideTransition = animateCards && fromUser && index !== previous && !motion.matches && typeof slides[index].animate === 'function';
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-leaving', slideTransition && i === previous);
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      if (active && fromUser) loadMedia(slide);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.setAttribute('aria-current', String(i === index));
    });
    if (track) {
      if (!fromUser || index === previous || motion.matches) {
        settleTrack();
      } else {
        // Place the real next slide beside the current one in the gesture's
        // direction. Rebase after the animation without cloning content.
        const direction = Math.sign(next - previous);
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';
        slides.forEach((slide, i) => {
          const slot = i === previous ? 0 : i === index ? direction : direction * (2 + i);
          slide.style.transform = `translateX(${(slot - i) * 100}%)`;
        });
        void track.offsetWidth;
        moving = true;
        track.style.transition = '';
        track.style.transform = `translateX(${-direction * 100}%)`;
        settleTimer = setTimeout(settleTrack, 600);
      }
    }
    if (slideTransition) {
      const direction = Math.sign(next - previous);
      const options = {duration: 480, easing: 'cubic-bezier(.22,.61,.36,1)'};
      moving = true;
      root.classList.add('is-sliding');
      const animationId = ++cardAnimationId;
      cardAnimations = [
        slides[previous].animate([
          {transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)'},
          {transform: `translateX(${-direction * 100}%)`, opacity: 0, filter: 'blur(3px)'}
        ], options),
        slides[index].animate([
          {transform: `translateX(${direction * 100}%)`, opacity: 0, filter: 'blur(3px)'},
          {transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)'}
        ], options)
      ];
      Promise.allSettled(cardAnimations.map(animation => animation.finished)).then(() => {
        if (animationId === cardAnimationId) settleCards();
      });
      settleTimer = setTimeout(settleCards, 800);
    }
    root.querySelectorAll('.master-bg-slide').forEach((bg, i, backgrounds) => {
      bg.classList.toggle('is-active', i === index % backgrounds.length);
      if (fromUser && i === index % backgrounds.length) loadMedia(bg);
    });
  }
  root.querySelector('.prev').addEventListener('click', () => show(index - 1, true));
  root.querySelector('.next').addEventListener('click', () => show(index + 1, true));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, true)));
  root.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1), true);
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
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), true);
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
    loadMedia(img);
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
    strip.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); strip.scrollLeft += event.key === 'ArrowRight' ? 200 : -200;}
    });
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

// The shared lower-page background follows scroll position in both directions.
(() => {
  const pricing = document.getElementById('pricing');
  if (!pricing) return;
  const body = document.body;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const styles = getComputedStyle(document.documentElement);
  const color = name => styles.getPropertyValue(name).trim().split(/\s+/).map(Number);
  const start = color('--visit-bg-start');
  const finish = color('--visit-bg-end');
  let frame = 0;
  let previousColor = '';

  function update() {
    frame = 0;
    const height = document.documentElement.clientHeight;
    const top = pricing.getBoundingClientRect().top;
    // Begin as the calculator enters the screen; finish before its controls reach the top.
    const progress = Math.max(0, Math.min(1, (height * .88 - top) / (height * .6)));
    const eased = motion.matches ? Number(progress >= .5) : progress * progress * (3 - 2 * progress);
    const background = `rgb(${start.map((channel, index) => Math.round(channel + (finish[index] - channel) * eased)).join(', ')})`;
    if (background === previousColor) return;
    previousColor = background;
    body.style.setProperty('--visit-background', background);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  update();
  body.classList.add('visit-theme-ready');
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  motion.addEventListener('change', schedule);
  // Images above the calculator can change its offset after a restored scroll position.
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.querySelector('main') || body);
})();
