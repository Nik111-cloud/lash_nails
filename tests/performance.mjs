// Install measurement tools separately: pnpm --dir .performance add lighthouse
// Usage: node tests/performance.mjs URL OUTPUT_BASE
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import lighthouse from '../.performance/node_modules/lighthouse/core/index.js';
const require = createRequire(new URL('../.performance/package.json', import.meta.url));
const {launch} = await import(pathToFileURL(require.resolve('chrome-launcher')).href);
const chrome = await launch({chromePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',chromeFlags:['--headless=new','--no-sandbox','--disable-gpu']});
try {
  const {lhr,report} = await lighthouse(process.argv[2] || 'http://127.0.0.1:4173/', {
    port:chrome.port,output:['json','html'],onlyCategories:['performance'],formFactor:'mobile',
    // Suppress tracking beacons during tests, while still loading/executing the analytics library.
    blockedUrlPatterns:['*://mc.yandex.*/watch/*','*://mc.yandex.*/watch?*','*://mc.yandex.*/webvisor/*'],
    logLevel:'error'
  });
  const target = process.argv[3];
  if (target) {fs.writeFileSync(`${target}.json`,report[0]);fs.writeFileSync(`${target}.html`,report[1]);}
  const metrics = Object.fromEntries(['first-contentful-paint','largest-contentful-paint','speed-index','total-blocking-time','cumulative-layout-shift'].map(id=>[id,lhr.audits[id].numericValue]));
  console.log(JSON.stringify({score:lhr.categories.performance.score,metrics,warnings:lhr.runWarnings},null,2));
} finally {await chrome.kill();}
