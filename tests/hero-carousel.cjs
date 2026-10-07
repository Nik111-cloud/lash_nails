const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const reducedMotion of ['no-preference','reduce']) {
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion});
      await context.route('**/mc.yandex.ru/**',route=>route.abort());
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:4173/',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Понятно',exact:true}).click();
      assert.equal(await page.locator('.hero-slide').count(),2);
      assert.equal(await page.locator('h1').count(),1);
      async function checkMove(direction, action) {
        const previous=await page.locator('.hero-slide').evaluateAll(slides=>slides.findIndex(s=>s.classList.contains('is-active')));
        await action();
        const expected=(previous+direction+2)%2;
        assert.equal(await page.locator('.hero-dot').nth(expected).getAttribute('aria-current'),'true');
        if(reducedMotion==='no-preference') {
          assert.equal(await page.locator('.hero-slides').evaluate(el=>el.style.transform),`translateX(${-direction*100}%)`);
          await page.waitForFunction(direction=>{
            const track=document.querySelector('.hero-slides');
            const x=new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
            return direction*x < -1 && Math.abs(x) < innerWidth-1;
          },direction);
          const incomingLeft=await page.locator('.hero-slide').nth(expected).evaluate(el=>el.getBoundingClientRect().left);
          assert.equal(Math.sign(incomingLeft),direction,'Incoming slide must arrive from the gesture direction, including wraparound');
          await page.waitForFunction(()=>{
            const track=document.querySelector('.hero-slides');
            return track.style.transition==='none' && new DOMMatrixReadOnly(getComputedStyle(track).transform).m41===0;
          });
        }
        const active=page.locator('.hero-slide').nth(expected);
        assert.equal(await active.evaluate(el=>el.inert),false);
        assert.ok(Math.abs(await active.evaluate(el=>el.getBoundingClientRect().left))<1,'Slide must settle without a visible reverse jump');
      }
      for(let i=0;i<4;i++) await checkMove(1,()=>page.locator('.hero-arrow.next').click());
      for(let i=0;i<4;i++) await checkMove(-1,()=>page.locator('.hero-arrow.prev').click());
      await checkMove(1,()=>page.keyboard.press('ArrowRight'));
      await checkMove(-1,()=>page.keyboard.press('ArrowLeft'));
      async function swipe(direction) {
        await page.evaluate(direction=>{
          const root=document.querySelector('.hero-carousel');
          const start=new Touch({identifier:1,target:root,clientX:200,clientY:300});
          const end=new Touch({identifier:1,target:root,clientX:200-direction*120,clientY:300});
          root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start],changedTouches:[start]}));
          root.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[end],changedTouches:[end]}));
          root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));
        },direction);
      }
      for(let i=0;i<4;i++) await checkMove(1,()=>swipe(1));
      for(let i=0;i<4;i++) await checkMove(-1,()=>swipe(-1));
      assert.deepEqual(errors,[]);
      console.log(`PASS ${reducedMotion}: repeated forward/backward wraparound with arrows, keys and swipes; no clones or runtime errors`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
