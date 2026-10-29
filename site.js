'use strict';

function onMediaChange(query, listener) {
  if (typeof query.addEventListener === 'function') query.addEventListener('change', listener);
  else if (typeof query.addListener === 'function') query.addListener(listener);
}

function decodeImage(image) {
  if (typeof image.decode === 'function') return image.decode();
  if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Image unavailable'));
  return new Promise((resolve, reject) => {
    const clean = () => {image.removeEventListener('load', loaded); image.removeEventListener('error', failed);};
    const loaded = () => {clean(); resolve();};
    const failed = () => {clean(); reject(new Error('Image unavailable'));};
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
  });
}

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

// Initialize pricing before optional media and animation features.
(() => {
  const form = document.getElementById('price-calculator');
  const total = document.getElementById('calculator-total');
  const count = document.getElementById('calculator-count');
  const brows = document.getElementById('brows-treatment');
  if (!form || !total || !count) return;
  const browInput = form.querySelector('input[name="brows"]');
  const numberFormat = new Intl.NumberFormat('ru-RU');
  function update() {
    const selected = [...form.querySelectorAll('input:checked')];
    if (brows) brows.disabled = !browInput?.checked;
    const sum = selected.reduce((value, input) => value + Number(input.name === 'brows' && brows ? brows.value : input.value), 0);
    const nextTotal = sum ? `от ${numberFormat.format(sum)} ₽` : 'Выберите услугу';
    const nextCount = selected.length ? `Выбрано услуг: ${selected.length}` : 'Можно выбрать несколько услуг';
    if (total.textContent !== nextTotal) total.textContent = nextTotal;
    if (count.textContent !== nextCount) count.textContent = nextCount;
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('pageshow', update);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) update();});
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
  const luminance = channels => channels.map(value => value / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const rgb = channels => `rgb(${channels.join(', ')})`;
  let frame = 0;
  let dirty = false;
  let lastTime = 0;
  let previousColor = '';
  const properties = new Map();
  function setProperty(name, value) {
    if (properties.get(name) === value) return;
    properties.set(name, value);
    body.style.setProperty(name, value);
  }

  function progress() {
    const height = document.documentElement.clientHeight;
    if (!height) return 0;
    const top = pricing.getBoundingClientRect().top;
    // Wait until the calculator reaches the lower half; finish near the top.
    const value = Math.max(0, Math.min(1, (height * .55 - top) / (height * .5)));
    return motion.matches ? Number(value >= .5) : value * value * (3 - 2 * value);
  }
  let target = progress();
  let current = target;

  function paint(value) {
    const channels = start.map((channel, index) => Math.round(channel + (finish[index] - channel) * value));
    const background = rgb(channels);
    if (background === previousColor) return;
    previousColor = background;
    const lightness = luminance(channels);
    const contrast = ink => {
      const level = luminance(ink);
      return (Math.max(lightness, level) + .05) / (Math.min(lightness, level) + .05);
    };
    const lightText = lightness < .179;
    let ink = lightText ? [255, 255, 255] : [42, 32, 25];
    if (contrast(ink) < 4.5) ink = [0, 0, 0];
    let muted = lightText ? [223, 238, 241] : [107, 92, 78];
    if (contrast(muted) < 4.5) muted = ink;
    setProperty('--visit-background', background);
    setProperty('--visit-ink', rgb(ink));
    setProperty('--visit-muted', rgb(muted));
    setProperty('--visit-line', lightText ? 'rgba(255,255,255,.3)' : 'rgba(42,32,25,.3)');
  }
  function update(now) {
    frame = 0;
    if (dirty) {target = progress(); dirty = false;}
    const elapsed = lastTime ? Math.min(now - lastTime, 64) : 16;
    lastTime = now;
    // Smooth the background in RAF; derive text targets from that same displayed RGB.
    current = motion.matches ? target : current + (target - current) * (1 - Math.exp(-elapsed / 165));
    if (Math.abs(target - current) < .0005) {
      current = target;
      lastTime = 0;
    }
    paint(current);
    if (current !== target) frame = requestAnimationFrame(update);
  }
  function schedule() {
    dirty = true;
    if (document.hidden) return;
    if (!frame) frame = requestAnimationFrame(update);
  }
  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }
  function resume() {pause(); schedule();}

  paint(current);
  body.classList.add('visit-theme-ready');
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', pause);
  window.addEventListener('load', schedule);
  document.addEventListener('visibilitychange', () => {if (document.hidden) pause(); else resume();});
  onMediaChange(motion, schedule);
  // Images above the calculator can change its offset after a restored scroll position.
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.querySelector('main') || body);
})();

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
  if (!hero) {observe(); return;}
  decodeImage(hero).catch(() => {}).then(() => requestAnimationFrame(() => requestAnimationFrame(observe)));
})();

(() => {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  let previousHeight;
  const update = () => {
    const height = topbar.offsetHeight;
    if (height === previousHeight) return;
    previousHeight = height;
    document.documentElement.style.setProperty('--topbar-h', `${height}px`);
  };
  update();
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(topbar);
  else {window.addEventListener('resize', update); window.addEventListener('load', update);}
})();

// Manual carousels keep the offer readable and keep hidden links out of keyboard navigation.
function setupCarousel(rootSelector, slideSelector, dotSelector, trackSelector) {
  const root = document.querySelector(rootSelector);
  if (!root) return;
  const slides = [...root.querySelectorAll(slideSelector)];
  if (!slides.length) return;
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
  if (animateCards) onMediaChange(motion, () => {
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
    const focused = document.activeElement;
    const restoreFocus = fromUser && index !== previous && slides[previous].contains(focused);
    const focusable = 'a[href], button:not([disabled]), [tabindex="0"]';
    const focusIndex = restoreFocus ? [...slides[previous].querySelectorAll(focusable)].indexOf(focused) : -1;
    const slideTransition = animateCards && fromUser && index !== previous && !motion.matches && typeof slides[index].animate === 'function';
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-leaving', slideTransition && i === previous);
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      if (active && fromUser) loadMedia(slide);
    });
    if (restoreFocus) {
      const destination = [...slides[index].querySelectorAll(focusable)][Math.max(0, focusIndex)] || root.querySelector('.next');
      destination?.focus({preventScroll: true});
    }
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

// Track intent only; DIKIDI handles opening the form and completed bookings.
(() => {
  const track = event => {
    if (event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    const booking = link.hasAttribute('data-dikidi-widget') && url.hostname === 'dikidi.net' && url.pathname === '/' && /^#widget=\d+$/.test(url.hash);
    const goal = booking ? 'booking_click' : url.protocol === 'tel:' ? 'phone_click' : url.hostname === 'wa.me' ? 'whatsapp_click' : null;
    if (!goal) return;
    const section = link.closest('section');
    const params = {placement: section?.id || (section?.classList.contains('hero-carousel') ? 'hero' : link.closest('.mobile-bar') ? 'mobile_bar' : 'header'), master_id: url.searchParams.get('m') || '', service: link.closest('.service-row')?.id || ''};
    try {if (typeof window.ym === 'function') window.ym(113129252, 'reachGoal', goal, params);} catch (_) { /* Analytics must never prevent opening the form. */ }
  };
  document.addEventListener('click', track);
  document.addEventListener('auxclick', track);
})();

// Keep one full photograph visible; load other work only when it is selected.
(() => {
  const gallery = document.querySelector('.portfolio-gallery');
  if (!gallery) return;
  const main = gallery.querySelector('.portfolio-photo');
  const image = main?.querySelector('img');
  const buttons = [...gallery.querySelectorAll('.portfolio-thumb')];
  const photos = buttons.map(button => {
    const img = button.querySelector('img');
    return {button, image: img, src: img?.dataset.src || img?.getAttribute('src'), alt: img?.alt || '', caption: button.dataset.caption || 'Ресницы'};
  }).filter(photo => photo.src);
  if (!main || !image || !photos.length) return;
  const caption = gallery.querySelector('.portfolio-caption');
  const counter = gallery.querySelector('.portfolio-counter');
  const controls = gallery.querySelector('.portfolio-controls');
  const status = gallery.querySelector('.portfolio-status');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, displayed = 0, generation = 0, animation;
  const wrap = value => ((value % photos.length) + photos.length) % photos.length;
  function select() {
    const first = Math.min(Math.floor(index / 4) * 4, Math.max(0, photos.length - 4));
    photos.forEach((photo, i) => {
      const visible = i >= first && i < first + 4;
      photo.button.hidden = !visible;
      photo.button.setAttribute('aria-pressed', String(i === index));
      if (visible && gallery.dataset.interacted === 'true') loadMedia(photo.image);
    });
    // Keyboard focus must not remain on a thumbnail that left the current page.
    if (photos.some(photo => photo.button.hidden && photo.button === document.activeElement)) photos[index].button.focus({preventScroll: true});
  }
  function describe() {
    caption.textContent = photos[displayed].caption;
    counter.textContent = `${String(displayed + 1).padStart(2, '0')} / ${photos.length}`;
    main.setAttribute('aria-label', `Рассмотреть работу ${displayed + 1}: ${photos[displayed].caption}`);
  }
  function show(next) {
    index = wrap(next);
    const id = ++generation;
    const photo = photos[index];
    gallery.dataset.interacted = 'true';
    select();
    main.setAttribute('aria-busy', 'true');
    status.textContent = 'Загружаем фото…';
    status.hidden = false;
    const incoming = new Image();
    incoming.src = photo.src;
    decodeImage(incoming).then(() => {
      if (id !== generation) return;
      delete image.dataset.src;
      image.src = photo.src;
      image.alt = photo.alt;
      displayed = index;
      describe();
      main.removeAttribute('aria-busy');
      status.hidden = true;
      animation?.cancel();
      if (!motion.matches && typeof image.animate === 'function') animation = image.animate([{opacity: .45}, {opacity: 1}], {duration: 220, easing: 'ease-out'});
    }).catch(() => {
      if (id !== generation) return;
      index = displayed;
      select();
      main.removeAttribute('aria-busy');
      status.textContent = 'Не удалось загрузить фото. Попробуйте ещё раз.';
    });
  }
  photos.forEach((photo, i) => photo.button.addEventListener('click', () => show(i)));
  gallery.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => show(index + Number(button.dataset.direction))));
  gallery.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    show(index + (event.key === 'ArrowRight' ? 1 : -1));
  });
  let touch = null, suppressClickUntil = 0;
  main.addEventListener('pointerdown', event => {touch = event.pointerType === 'touch' ? {x: event.clientX, y: event.clientY} : null;}, {passive: true});
  main.addEventListener('pointerup', event => {
    if (!touch) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {suppressClickUntil = Date.now() + 400; show(index + (dx < 0 ? 1 : -1));}
  }, {passive: true});
  main.addEventListener('pointercancel', () => {touch = null;}, {passive: true});
  main.addEventListener('click', event => {if (Date.now() < suppressClickUntil) {event.preventDefault(); event.stopPropagation();}}, true);
  controls.hidden = photos.length < 2;
  gallery.querySelector('.portfolio-thumbs').hidden = photos.length < 2;
  select();
  describe();
})();

(() => {
  const box = document.getElementById('lightbox');
  const image = document.getElementById('lightbox-img');
  const closeButton = box.querySelector('.lightbox-close');
  const zoomOut = box.querySelector('.lightbox-zoom-out');
  const zoomReset = box.querySelector('.lightbox-zoom-reset');
  const zoomIn = box.querySelector('.lightbox-zoom-in');
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
    const layout = getComputedStyle(box);
    const paddingX = parseFloat(layout.paddingLeft) + parseFloat(layout.paddingRight);
    const paddingY = parseFloat(layout.paddingTop) + parseFloat(layout.paddingBottom);
    const maxX = Math.max(0, (image.offsetWidth * scale - box.clientWidth + paddingX) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - box.clientHeight + paddingY) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    zoomOut?.setAttribute('aria-disabled', String(scale <= 1));
    zoomIn?.setAttribute('aria-disabled', String(scale >= 4));
    if (zoomReset) zoomReset.textContent = `${Math.round(scale * 100)}%`;
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
  function open(target) {
    const img = target.matches('img') ? target : target.querySelector('img');
    if (!img) return;
    loadMedia(img);
    trigger = target;
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
  function zoomAtCenter(next) {
    const rect = image.getBoundingClientRect();
    zoom(next, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  zoomOut?.addEventListener('click', () => zoomAtCenter(scale - .5));
  zoomIn?.addEventListener('click', () => zoomAtCenter(scale + .5));
  zoomReset?.addEventListener('click', reset);
  document.addEventListener('click', event => {const img = event.target.closest(selector); if (img) open(img);});
  document.addEventListener('keydown', event => {
    if (active()) {
      if (event.key === 'Escape') {event.preventDefault(); close();}
      else if (event.key === 'Tab') {
        const controls = [...box.querySelectorAll('button:not([disabled])')];
        const current = controls.indexOf(document.activeElement);
        event.preventDefault();
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next]?.focus();
      } else if (['+', '=', 'Add', '-', 'Subtract', '0', 'Home'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0' || event.key === 'Home') reset();
        else zoomAtCenter(scale + (['-', 'Subtract'].includes(event.key) ? -.5 : .5));
      } else if (scale > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') x += 48;
        if (event.key === 'ArrowRight') x -= 48;
        if (event.key === 'ArrowUp') y += 48;
        if (event.key === 'ArrowDown') y -= 48;
        apply();
      }
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
  ['review-strip'].forEach(className => {
    const strip = document.querySelector(`.${className}`);
    if (!strip) return;
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
