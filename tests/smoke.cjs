// Run with Node.js and Playwright available (Chrome installed).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.REVIEW_URL || 'http://127.0.0.1:4173';
const output = process.env.REVIEW_OUTPUT;

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const errors = [];
  const sizes = process.env.CHECK_LIVE_ONLY || process.env.REVIEW_FAST_ONLY ? [] : [[320,740],[360,800],[390,844],[768,900],[900,900],[1024,900],[1440,900],[844,390]];
  try {
    for (const [width,height] of sizes) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      await context.route('**/mc.yandex.ru/**', route => route.abort());
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
      await page.waitForFunction(()=>document.querySelector('.portfolio-photo').naturalWidth > 0);
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
      assert.match(await page.locator('#calculator-total').textContent(),/4\s*500/);
      await page.locator('input[name="brows"]').check();
      await page.locator('#brows-treatment').selectOption('2200');
      assert.match(await page.locator('#calculator-total').textContent(),/6\s*700/);
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
      assert.equal(calculations,96);
      // Stub analytics: validation never sends conversion events to the production counter.
      await page.evaluate(() => {window.reviewGoals=[];window.ym=(...args)=>window.reviewGoals.push(args);});
      await page.locator('#pricing .btn').click();
      assert.equal(await page.locator('#booking-overlay').getAttribute('aria-hidden'),'false');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#booking-overlay').getAttribute('aria-hidden'),'true');
      assert.equal(await page.evaluate(() => window.reviewGoals[0][2]),'booking_click');
      await context.route('https://dikidi.net/**',route=>route.fulfill({contentType:'text/html',body:'<title>Booking test</title>DIKIDI navigation test'}));
      await page.locator('.master-slide.is-active a').click();
      await page.waitForURL('https://dikidi.net/**');
      assert.match(page.url(),/m=4373807/);
      await page.goBack({waitUntil:'networkidle'});
      assert.equal(await page.locator('#booking-overlay').getAttribute('aria-hidden'),'true');
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
      console.log(`PASS ${width}×${height}: layout, images, carousels, modal, 96 calculations, booking/back, 3 goals`);
      await context.close();
    }
    assert.deepEqual(errors,[],'Browser runtime errors');
    const noJs = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    await noJs.route('**/mc.yandex.ru/**',route=>route.abort());
    const fallback = await noJs.newPage();
    await fallback.goto(base);
    assert.equal(await fallback.locator('.hero-slide').first().getByRole('link').isVisible(),true);
    assert.equal(await fallback.locator('#pricing noscript').isVisible(),true);
    await noJs.close();
    console.log('PASS no-JavaScript fallback; no runtime errors');
    const fast = await browser.newContext({viewport:{width:390,height:844}});
    await fast.route('**/mc.yandex.ru/**',route=>route.abort());
    let releaseHero;
    const heroHeld = new Promise(resolve=>{releaseHero=resolve;});
    await fast.route('**/img1.avif',async route=>{await heroHeld;await route.continue();});
    const fastPage=await fast.newPage();
    try {
      await fastPage.goto(base,{waitUntil:'domcontentloaded'});
      assert.equal(await fastPage.locator('.hero-slide-photo').first().evaluate(img=>img.complete),false);
      await fastPage.locator('#portfolio').scrollIntoViewIfNeeded();
      await fastPage.waitForFunction(()=>document.querySelector('.portfolio-photo').naturalWidth>0);
      console.log('PASS immediate scroll loads photos even while the hero image is still downloading');
    } finally {releaseHero();await fast.close();}
    if (process.env.CHECK_LIVE) {
      const live = await browser.newContext();
      await live.route('**/mc.yandex.ru/**',route=>route.abort());
      for (const url of ['https://www.estetika-ufa.online/','https://estetika-ufa.online/','http://www.estetika-ufa.online/','http://estetika-ufa.online/','https://dikidi.net/2038825?p=0.pi']) {
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
