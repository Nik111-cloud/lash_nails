// Run with Node.js and Playwright available (Chrome installed).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.REVIEW_URL || 'http://127.0.0.1:4173';
const output = process.env.REVIEW_OUTPUT;
const bookingUrl = 'https://dikidi.net/#widget=221383';
const widgetScript = 'https://dikidi.ru/assets/js/widget_record/widget2.min.js?v=1';

async function stubBookingWidget(context) {
  // Exercise the official script's link contract without loading its UI or sending bookings.
  await context.route('https://dikidi.ru/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/assets/js/widget_record/widget2.min.js') return route.abort();
    return route.fulfill({contentType:'application/javascript',body:`
      window.reviewWidgetOpens = [];
      document.addEventListener('click', event => {
        const link = event.target.closest('a[data-dikidi-widget]');
        if (!link || link.href !== ${JSON.stringify(bookingUrl)}) return;
        event.preventDefault();
        window.reviewWidgetOpens.push(link.href);
      });
    `});
  });
  await context.route('https://dikidi.net/**', route => route.abort());
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const errors = [];
  const sizes = process.env.CHECK_LIVE_ONLY || process.env.REVIEW_FAST_ONLY ? [] : [[320,740],[360,800],[390,844],[768,900],[900,900],[1024,900],[1440,900],[844,390]];
  try {
    for (const [width,height] of sizes) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      await context.route('**/mc.yandex.ru/**', route => route.abort());
      await stubBookingWidget(context);
      const page = await context.newPage();
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, {waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Понятно',exact:true}).click();
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`Overflow at ${width}`);
      assert.equal(requests.some(url=>url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')),false,'Fonts must be hosted locally');
      assert.equal(requests.some(url=>/\/review\d+\.avif/.test(url)),false,'Reviews must not compete with the first screen');
      assert.equal(requests.some(url=>url.endsWith('/img2.avif')),false,'Hidden hero slide must not download on first load');
      await page.locator('.hero-arrow.next').click();
      assert.equal(await page.locator('.hero-slide').nth(0).evaluate(el => el.inert),true);
      assert.equal(await page.locator('.hero-dot').nth(1).getAttribute('aria-current'),'true');
      await page.locator('.hero-arrow.prev').click();
      await page.locator('#lash-effects').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.querySelector('.effect-photo').naturalWidth > 0);
      await page.locator('#portfolio').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.querySelector('.portfolio-photo img').naturalWidth > 0);
      // All images, including those intentionally lazy loaded, must actually decode.
      const images = await page.evaluate(async () => {
        document.querySelectorAll('img[data-src]').forEach(img=>loadMedia(img));
        const images = [...document.images].filter(img => img.getAttribute('src') && !img.src.includes('mc.yandex.ru'));
        await Promise.all(images.map(async img => {img.loading='eager'; try{await img.decode();}catch(_){}}));
        return images.filter(img => !img.naturalWidth).map(img => img.getAttribute('src'));
      });
      assert.deepEqual(images,[],`Image decoding failed at ${width}`);
      await page.locator('#pricing').scrollIntoViewIfNeeded();
      await page.locator('input[name="manicure"]').check();
      assert.match(await page.locator('#calculator-total').textContent(),/4\s*700/);
      await page.locator('input[name="brows"]').check();
      await page.locator('#brows-treatment').selectOption('2200');
      assert.match(await page.locator('#calculator-total').textContent(),/6\s*900/);
      await page.locator('input[name="lashes"]').uncheck();
      await page.locator('input[name="manicure"]').uncheck();
      await page.locator('input[name="brows"]').uncheck();
      assert.equal(await page.locator('#calculator-total').textContent(),'Выберите услугу');
      assert.equal(await page.locator('#brows-treatment').isDisabled(),true);
      await page.locator('input[name="lashes"]').check();
      await page.locator('#master').scrollIntoViewIfNeeded();
      for (let index=0;index<4;index++) {
        await page.locator('.master-dot').nth(index).click();
        const active = page.locator('.master-slide.is-active');
        assert.equal(await active.count(),1);
        assert.equal(await active.evaluate(el => el.inert),false);
        assert.equal(await page.locator('.master-slide:not(.is-active) a').first().evaluate(el => el.closest('.master-slide').inert),true);
      }
      await page.locator('.master-dot').first().click();
      const photo = page.locator('.portfolio-photo').first();
      await photo.scrollIntoViewIfNeeded();
      await photo.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'),'false');
      assert.equal(await page.locator('main').evaluate(el => el.inert),true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.lightbox-close').evaluate(el => el === document.activeElement),true);
      await page.keyboard.press('Escape');
      assert.equal(await photo.evaluate(el => el === document.activeElement),true);
      assert.equal(await page.locator('main').evaluate(el => el.inert),false);
      await page.locator('.review-photo-full').first().click();
      await page.locator('.lightbox-close').click();
      // Verify every combination of services and mutually exclusive brow procedures.
      const calculations = await page.evaluate(() => {
        const form = document.getElementById('price-calculator');
        const inputs = [...form.querySelectorAll('input')];
        const select = document.getElementById('brows-treatment');
        let count = 0;
        for(let mask=0;mask<(1 << inputs.length);mask++) for(const browPrice of [1000,1500,2200]) {
          select.value=String(browPrice);
          inputs.forEach((input,i)=>{input.checked=Boolean(mask & (1<<i));});
          form.dispatchEvent(new Event('change',{bubbles:true}));
          const expected=inputs.reduce((sum,input)=>sum+(input.checked?Number(input.name==='brows'?select.value:input.value):0),0);
          const actual=Number(document.getElementById('calculator-total').textContent.replace(/\D/g,''));
          if(actual!==expected) throw Error(`Calculator mismatch ${mask}: ${actual} vs ${expected}`);
          count++;
        }
        inputs.forEach((input,i)=>{input.checked=i===0;});
        select.value='1000';form.dispatchEvent(new Event('change',{bubbles:true}));
        return count;
      });
      assert.equal(calculations,192);
      // Stub analytics: validation never sends conversion events to the production counter.
      await page.evaluate(() => {window.reviewGoals=[];window.ym=(...args)=>window.reviewGoals.push(args);});
      assert.equal(await page.locator(`script[src="${widgetScript}"]`).count(),1,'Official widget script is included');
      const bookingLinks = page.locator('a[href^="https://dikidi.net/"]:not(noscript a),a[href^="https://dikidi.ru/"]:not(noscript a)');
      assert(await bookingLinks.count() > 0,'Online booking links exist');
      for (const link of await bookingLinks.all()) {
        assert.equal(await link.getAttribute('href'),bookingUrl,'Every booking link uses the shared widget');
        assert.equal(await link.evaluate(el => el.hasAttribute('data-dikidi-widget')),true,'Every booking link binds the official widget');
      }
      assert.equal(await page.locator('#booking-overlay').count(),0,'No simulated booking loader');
      const bookingPageUrl = page.url();
      await page.locator('#pricing .btn').click();
      assert.equal(page.url(),bookingPageUrl,'The widget opens without leaving the page');
      assert.deepEqual(await page.evaluate(() => window.reviewWidgetOpens),[bookingUrl]);
      assert.deepEqual(await page.evaluate(() => window.reviewGoals.map(args => args[2])),['booking_click']);
      await page.locator('.master-slide.is-active a').click();
      assert.equal(page.url(),bookingPageUrl,'Master booking also stays on the page');
      assert.deepEqual(await page.evaluate(() => window.reviewWidgetOpens),[bookingUrl,bookingUrl]);
      assert.deepEqual(await page.evaluate(() => window.reviewGoals.map(args => args[2])),['booking_click','booking_click'],'One intent goal per booking click, without completed-booking goals');
      assert.equal(await page.locator('#booking-overlay').count(),0);
      assert.equal(requests.some(url => url.startsWith('https://dikidi.net/')),false,'The test never opens the real booking service');
      await page.evaluate(() => {window.reviewGoals=[];window.ym=(...args)=>window.reviewGoals.push(args);});
      // Prevent external handlers after goal listeners have had a chance to record intent.
      await page.evaluate(() => document.addEventListener('click',e=>{if(e.target.closest('a[href^="tel:"]')) e.preventDefault();}));
      await page.locator('#contacts a[href^="tel:"]').click();
      assert.equal(await page.evaluate(() => window.reviewGoals[0][2]),'phone_click');
      await context.route('https://wa.me/**',route=>route.fulfill({contentType:'text/html',body:'WhatsApp test'}));
      const [popup] = await Promise.all([page.waitForEvent('popup'),page.locator('#contacts a[href^="https://wa.me"]').click()]);
      await popup.close();
      assert.equal(await page.evaluate(() => window.reviewGoals[1][2]),'whatsapp_click');
      await page.evaluate(() => scrollTo(0,0));
      if (output && [390,1440].includes(width)) {
        fs.mkdirSync(output,{recursive:true});
        await page.evaluate(async () => {
          document.activeElement?.blur();
          document.querySelectorAll('[data-src],[data-background]').forEach(element=>loadMedia(element));
          await Promise.all([...document.images].filter(img=>img.getAttribute('src')).map(async img=>{img.loading='eager';try{await img.decode();}catch(_){}}));
          await document.fonts.ready;
        });
        await page.screenshot({path:path.join(output,`landing-${width}.png`),fullPage:true});
        await page.screenshot({path:path.join(output,`hero-${width}.png`)});
        // Sticky chrome is hidden only in the isolated section screenshot.
        await page.addStyleTag({content:'.topbar,.mobile-bar,.skip-link{visibility:hidden!important}'});
        await page.locator('#pricing').screenshot({path:path.join(output,`calculator-${width}.png`)});
      }
      console.log(`PASS ${width}×${height}: layout, images, carousels, modal, ${calculations} calculations, official widget bindings and intent goals`);
      await context.close();
    }
    assert.deepEqual(errors,[],'Browser runtime errors');
    const noJs = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    await noJs.route('**/mc.yandex.ru/**',route=>route.abort());
    await stubBookingWidget(noJs);
    const fallback = await noJs.newPage();
    await fallback.goto(base);
    assert.equal(await fallback.locator('.hero-slide').first().getByRole('link').isVisible(),true);
    assert.equal(await fallback.locator('#pricing noscript').isVisible(),true);
    assert.equal(await fallback.locator('#pricing noscript a').getAttribute('href'),'https://dikidi.net/2038825?p=0.pi','Without JavaScript, the price fallback remains available');
    await noJs.close();
    console.log('PASS no-JavaScript fallback; no runtime errors');
    const fast = await browser.newContext({viewport:{width:390,height:844}});
    await fast.route('**/mc.yandex.ru/**',route=>route.abort());
    await stubBookingWidget(fast);
    let releaseHero;
    const heroHeld = new Promise(resolve=>{releaseHero=resolve;});
    await fast.route('**/img1.avif',async route=>{await heroHeld;await route.continue();});
    const fastPage=await fast.newPage();
    try {
      await fastPage.goto(base,{waitUntil:'domcontentloaded'});
      assert.equal(await fastPage.locator('.hero-slide-photo').first().evaluate(img=>img.complete),false);
      await fastPage.locator('#portfolio').scrollIntoViewIfNeeded();
      await fastPage.waitForFunction(()=>document.querySelector('.portfolio-photo img').naturalWidth>0);
      console.log('PASS immediate scroll loads photos even while the hero image is still downloading');
    } finally {releaseHero();await fast.close();}
    if (process.env.CHECK_LIVE) {
      const live = await browser.newContext();
      await live.route('**/mc.yandex.ru/**',route=>route.abort());
      await stubBookingWidget(live);
      for (const url of ['https://www.estetika-ufa.online/','https://estetika-ufa.online/','http://www.estetika-ufa.online/','http://estetika-ufa.online/']) {
        const page = await live.newPage();
        try {
          const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
          console.log(JSON.stringify({live:url,status:response.status(),finalUrl:page.url(),title:await page.title()}));
        } catch(error) {console.log(JSON.stringify({live:url,error:error.message}));}
        await page.close();
      }
      await live.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
