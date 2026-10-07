// Integration check with a fake counter; never sends events to Yandex.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.testGoals = [];
      window.ym = (counter, method, ...args) => {
        if (method === 'getClientID') setTimeout(() => args[0]('1234567890123456789'), 30);
        if (method === 'reachGoal') window.testGoals.push({counter, goal: args[0]});
      };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.waitForFunction(() => document.querySelector('a[href*="wa.me"]').href.includes('text='));
    const links = await page.locator('a[href*="wa.me"]').evaluateAll(nodes => nodes.map(node => node.href));
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.equal(new URL(link).pathname, '/79649644775');
      assert.match(new URL(link).searchParams.get('text'), /1234567890123456789/);
    }
    assert.equal(await page.evaluate(() => window.getYandexClientID()), '1234567890123456789');
    // Let the site's click handler run, then cancel only browser navigation.
    await page.evaluate(() => {
      window.addEventListener('click', event => event.preventDefault(), {once: true});
      document.querySelector('a[href*="wa.me"]').click();
    });
    assert.deepEqual(await page.evaluate(() => window.testGoals), [{counter: 113129252, goal: 'whatsapp_click'}]);
    assert.deepEqual(errors, []);
    console.log('Browser integration: both WhatsApp links, ClientID API, intent-only goal and no JS errors passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
