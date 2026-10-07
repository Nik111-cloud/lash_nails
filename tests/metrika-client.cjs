// Run with Node.js; no live analytics requests or conversions are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'metrika-client.js'), 'utf8');

function setup({ym, storageBlocked = false} = {}) {
  const timers = new Map();
  const events = {};
  const storage = new Map([['yandex_client_id', '999']]);
  const links = [
    {href: 'https://wa.me/79649644775'},
    {href: 'https://wa.me/79649644775?text=' + encodeURIComponent('Запишите меня')},
    {href: 'https://dikidi.net/2038825?p=0.pi'}
  ];
  let clock = 0;
  let nextId = 0;
  const window = {ym, addEventListener: (name, fn) => {events[name] = fn;}};
  const context = {
    window, URL,
    document: {querySelectorAll: () => links},
    localStorage: {
      setItem(key, value) {if (storageBlocked) throw Error('Blocked'); storage.set(key, value);},
      removeItem(key) {if (storageBlocked) throw Error('Blocked'); storage.delete(key);}
    },
    setTimeout(fn, delay) {const id = ++nextId; timers.set(id, {fn, time: clock + delay}); return id;},
    clearTimeout(id) {timers.delete(id);}
  };
  vm.runInNewContext(source, context);
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].time - b[1].time)[0];
      if (!next || next[1].time > end) break;
      clock = next[1].time;
      timers.delete(next[0]);
      next[1].fn();
    }
    clock = end;
  }
  return {window, links, storage, events, advance, timers};
}

(async () => {
  // Requests queue during async counter startup; concurrent callers share the result.
  let callback;
  let calls = 0;
  const app = setup({ym(counter, method, fn) {
    assert.equal(counter, 113129252);
    assert.equal(method, 'getClientID');
    callback = fn;
    calls++;
  }});
  const originalBooking = app.links[2].href;
  const result = app.window.getYandexClientID();
  let callbackResult;
  app.window.getYandexClientID(value => {callbackResult = value;});
  assert.equal(calls, 1);
  callback('1234567890123456789');
  assert.equal(await result, '1234567890123456789');
  assert.equal(callbackResult, '1234567890123456789');
  assert.equal(app.storage.get('yandex_client_id'), '1234567890123456789');
  assert.equal(new URL(app.links[0].href).searchParams.get('text'), 'Здравствуйте! Хочу записаться.\nКод обращения: 1234567890123456789');
  assert.equal(new URL(app.links[1].href).searchParams.get('text'), 'Запишите меня\nКод обращения: 1234567890123456789');
  assert.equal(app.links[2].href, originalBooking);
  assert.equal(app.timers.size, 0);

  // Restoring a page updates both storage and links without duplicating message text.
  app.events.pageshow({persisted: true});
  callback('2222222222222222222');
  await Promise.resolve();
  assert.equal(app.storage.get('yandex_client_id'), '2222222222222222222');
  const message = new URL(app.links[0].href).searchParams.get('text');
  assert.equal(message.includes('1234567890123456789'), false);
  assert.equal((message.match(/Код обращения/g) || []).length, 1);

  // A late counter can supply the ID even when storage access throws.
  const delayed = setup({storageBlocked: true});
  const delayedResult = delayed.window.getYandexClientID();
  delayed.window.ym = (_, __, fn) => fn('333');
  delayed.advance(100);
  assert.equal(await delayedResult, '333');
  assert.match(new URL(delayed.links[0].href).searchParams.get('text'), /333/);
  assert.equal(delayed.timers.size, 0);

  // Blocking the tag must finish, clear stale cache and preserve usable original links.
  let lateCallback;
  const blocked = setup({ym: (_, __, fn) => {lateCallback = fn;}});
  const blockedResult = blocked.window.getYandexClientID();
  blocked.advance(8000);
  assert.equal(await blockedResult, null);
  assert.equal(blocked.storage.has('yandex_client_id'), false);
  lateCallback('444');
  assert.equal(new URL(blocked.links[0].href).searchParams.has('text'), false);
  assert.equal(blocked.timers.size, 0);

  const absent = setup();
  const absentResult = absent.window.getYandexClientID();
  absent.advance(8000);
  assert.equal(await absentResult, null);
  assert.equal(absent.timers.size, 0);
  console.log('Metrica ClientID: async startup, fresh IDs, WhatsApp, blocked storage/tag and timeout passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
