// Run with Node.js. No browser, network, live analytics, or bookings are used.
// The optional media initializer deliberately fails after the essential startup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback));
  }
  fire(type, extra = {}) {
    const event = {type, target: this, preventDefault() {}, ...extra};
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
  }
}

function setup(filename, legacyMedia) {
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const optionalFailure = new Error('optional-media-test');
  const writes = [];
  const values = new Map();
  const style = {
    setProperty(name, value) { writes.push({name, value}); values.set(name, value); },
    getPropertyValue(name) { return values.get(name) || ''; }
  };
  const classes = new Set();
  const body = {
    style,
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      contains(name) { return classes.has(name); }
    }
  };
  const inputs = [
    {name: 'lashes', value: '2000', checked: true},
    {name: 'lashLamination', value: '1900', checked: false},
    {name: 'manicure', value: '2500', checked: false},
    {name: 'makeup', value: '2000', checked: false},
    {name: 'brows', value: '1000', checked: false}
  ];
  const form = new Events();
  form.elements = Object.fromEntries(inputs.map(input => [input.name, input]));
  form.querySelector = selector => {
    assert.equal(selector, 'input[name="brows"]');
    return form.elements.brows;
  };
  form.querySelectorAll = selector => {
    assert.equal(selector, 'input:checked');
    return inputs.filter(input => input.checked);
  };
  const total = {textContent: 'от 2 000 ₽'};
  const count = {textContent: 'Выбрано услуг: 1'};
  const brows = {value: '1000', disabled: true};
  let pricingTop = 1000;
  const pricing = {getBoundingClientRect: () => ({top: pricingTop})};
  const main = {};
  const ids = {
    'price-calculator': form, 'calculator-total': total, 'calculator-count': count,
    'brows-treatment': brows, pricing
  };
  const document = new Events();
  document.body = body;
  document.hidden = false;
  document.documentElement = {clientHeight: 800, style};
  document.getElementById = id => ids[id] || null;
  document.querySelector = selector => {
    if (selector === '.hero-slide-photo') throw optionalFailure;
    if (selector === 'main') return main;
    throw new Error(`Unexpected startup selector: ${selector}`);
  };
  const window = new Events();
  window.document = document;
  const media = new Events();
  media.matches = false;
  if (legacyMedia) {
    media.addListener = callback => Events.prototype.addEventListener.call(media, 'change', callback);
    media.addEventListener = undefined;
  }
  const frames = new Map();
  let nextFrame = 0;
  let time = 0;
  let formatterCount = 0;
  const context = vm.createContext({
    window, document,
    matchMedia: () => media,
    getComputedStyle: () => ({getPropertyValue: name => ({
      '--visit-bg-start': '251 247 242', '--visit-bg-end': '49 91 104'
    })[name] || ''}),
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    Intl: {NumberFormat: function (...args) { formatterCount += 1; return new Intl.NumberFormat(...args); }},
    console
  });
  // Simulate a separate, optional feature failing. Essential startup must have
  // finished before this point, even without ResizeObserver or modern MQL APIs.
  assert.throws(() => vm.runInContext(source, context, {filename}), error => error === optionalFailure);

  function flush() {
    let ticks = 0;
    while (frames.size && ticks < 300) {
      const pending = [...frames.values()];
      frames.clear();
      time += 16;
      ticks += 1;
      for (const callback of pending) callback(time);
    }
    assert.equal(frames.size, 0, 'Animation must stop scheduling frames after settling');
    return ticks;
  }
  return {
    body, form, inputs, total, count, brows, window, document, media, frames, writes, values,
    flush, setPricingTop(value) { pricingTop = value; }, formatterCount: () => formatterCount
  };
}

function numericTotal(app) { return Number(app.total.textContent.replace(/\D/g, '')); }
function select(app, names, browPrice = '1000') {
  app.inputs.forEach(input => { input.checked = names.includes(input.name); });
  app.brows.value = browPrice;
}

for (const filename of ['site.js', 'app/src/scripts/site.js']) {
  for (const legacyMedia of [false, true]) {
    const app = setup(filename, legacyMedia);
    assert.equal(app.body.classList.contains('visit-theme-ready'), true, 'Lower theme starts before optional media');
    assert.ok(app.form.listeners.get('change')?.length, 'Calculator starts before optional media');

    let combinations = 0;
    for (let mask = 0; mask < (1 << app.inputs.length); mask += 1) {
      for (const browPrice of ['1000', '1500', '2200']) {
        app.inputs.forEach((input, index) => { input.checked = Boolean(mask & (1 << index)); });
        app.brows.value = browPrice;
        app.form.fire('change');
        const expected = app.inputs.reduce((sum, input) => sum + (input.checked ? Number(input.name === 'brows' ? browPrice : input.value) : 0), 0);
        assert.equal(numericTotal(app), expected, `${filename}: total for mask ${mask}, brows ${browPrice}`);
        assert.equal(app.brows.disabled, !app.form.elements.brows.checked);
        if (!expected) assert.equal(app.total.textContent, 'Выберите услугу');
        combinations += 1;
      }
    }
    assert.equal(combinations, 96);

    select(app, ['lashes', 'makeup']);
    app.form.fire('input');
    assert.equal(numericTotal(app), 4000, 'Native input event also updates the total');

    select(app, ['manicure', 'brows'], '2200');
    app.total.textContent = 'stale';
    app.window.fire('pageshow', {persisted: true});
    assert.equal(numericTotal(app), 4700, 'BFCache restoration recalculates existing form values');
    assert.deepEqual(app.inputs.filter(input => input.checked).map(input => input.name), ['manicure', 'brows']);
    assert.equal(app.brows.value, '2200', 'Restoration must preserve the chosen brow procedure');
    app.flush();

    app.document.hidden = true;
    app.document.fire('visibilitychange');
    select(app, ['brows'], '1500');
    app.total.textContent = 'stale';
    app.document.hidden = false;
    app.document.fire('visibilitychange');
    assert.equal(numericTotal(app), 1500, 'Returning to the tab resynchronizes the selected services');
    assert.deepEqual(app.inputs.filter(input => input.checked).map(input => input.name), ['brows']);
    assert.equal(app.brows.disabled, false);
    assert.equal(app.formatterCount(), 1, 'Reuse one price formatter instead of constructing it on every event');
    app.flush();

    app.setPricingTop(0);
    app.window.fire('scroll');
    const transitionFrames = app.flush();
    assert.ok(transitionFrames > 1, 'Normal motion keeps the existing gradual transition');
    assert.deepEqual(app.values.get('--visit-background').match(/\d+/g).map(Number), [49, 91, 104]);
    const previous = new Map();
    for (const {name, value} of app.writes) {
      assert.notEqual(value, previous.get(name), `Do not rewrite unchanged ${name}`);
      previous.set(name, value);
    }
    const writeCount = name => app.writes.filter(write => write.name === name).length;
    assert.ok(writeCount('--visit-background') > 10, 'Exercise several intermediate background colors');
    for (const name of ['--visit-ink', '--visit-muted', '--visit-line']) {
      assert.ok(writeCount(name) < writeCount('--visit-background'), `${name} must not be rewritten on every background frame`);
    }

    // A queued RAF must not block a fresh update after hiding/restoring a page.
    app.setPricingTop(1000);
    app.window.fire('scroll');
    assert.equal(app.frames.size, 1);
    app.window.fire('pagehide', {persisted: true});
    assert.equal(app.frames.size, 0, 'Leaving the page cancels its pending animation frame');
    app.window.fire('pageshow', {persisted: true});
    assert.equal(app.frames.size, 1, 'Restored page starts a fresh frame');
    app.flush();
    assert.deepEqual(app.values.get('--visit-background').match(/\d+/g).map(Number), [251, 247, 242]);

    app.setPricingTop(0);
    app.window.fire('scroll');
    app.document.hidden = true;
    app.document.fire('visibilitychange');
    assert.equal(app.frames.size, 0, 'Hidden tab cancels its pending animation frame');
    app.document.hidden = false;
    app.document.fire('visibilitychange');
    assert.equal(app.frames.size, 1, 'Visible tab restarts its animation');
    app.flush();
    assert.deepEqual(app.values.get('--visit-background').match(/\d+/g).map(Number), [49, 91, 104]);

    app.media.matches = true;
    app.setPricingTop(1000);
    app.media.fire('change');
    assert.ok(app.flush() <= 1, 'Reduced motion settles without an animated frame loop');
    assert.deepEqual(app.values.get('--visit-background').match(/\d+/g).map(Number), [251, 247, 242]);
    console.log(`PASS ${filename}, ${legacyMedia ? 'legacy' : 'modern'} media: optional failure isolation, 96 totals, restoration, style cache, RAF lifecycle`);
  }
}
