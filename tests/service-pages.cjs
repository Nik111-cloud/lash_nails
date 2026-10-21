// Validate exported HTML without starting a browser or sending real bookings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.estetika-ufa.online';
const specs = [
  {slug: 'narashchivanie-resnits', section: 'lashes', price: 2200, masters: ['4373807', '4373819'], photos: 3},
  {slug: 'laminirovanie-resnits', section: 'lash-lamination', price: 1900, masters: ['4399020'], photos: 0},
  {slug: 'manikyur', section: 'manicure', price: 2500, masters: ['4396039'], photos: 3},
];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const landing = read('index.html');
const sitemap = read('sitemap.xml');
const titles = new Set();
const descriptions = new Set();
function scripts(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}
function localLinks(html, base) {
  for (const match of html.matchAll(/\b(?:href|src|data-src)="([^"<>]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), base);
    if (url.origin !== origin) continue;
    const file = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const location = path.join(root, decodeURIComponent(file));
    assert(fs.existsSync(location), `Missing local file: ${match[1]} on ${base}`);
    if (url.hash && location.endsWith('.html')) {
      const target = fs.readFileSync(location, 'utf8');
      assert(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Missing anchor: ${url.href}`);
    }
  }
}
for (const spec of specs) {
  const canonical = `${origin}/${spec.slug}/`;
  const html = read(`${spec.slug}/index.html`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'One main heading per page');
  assert(html.includes(`<link rel="canonical" href="${canonical}"`), `Self canonical for ${spec.slug}`);
  assert(!/noindex/i.test(html));
  assert(!/15%|22:00/.test(html), 'No previous offer or opening hours');
  assert(html.includes('Скидка 10% на первое посещение'));
  assert(html.includes('10:00–21:00'));
  titles.add(html.match(/<title>([^<]+)<\/title>/)[1]);
  descriptions.add(html.match(/<meta name="description" content="([^"]+)"/)[1]);
  const graph = scripts(html).flatMap((item) => item['@graph'] || [item]);
  const service = graph.find((item) => item['@type'] === 'Service');
  const salon = graph.find((item) => item['@type'] === 'BeautySalon');
  assert.equal(service.offers.priceSpecification.minPrice, spec.price);
  assert.equal(salon.openingHoursSpecification.closes, '21:00');
  assert.equal(graph.find((item) => item['@type'] === 'BreadcrumbList').itemListElement[1].item, canonical);
  const normal = html.replaceAll('\u00a0', ' ');
  assert(normal.includes(`от ${new Intl.NumberFormat('ru-RU').format(spec.price).replaceAll('\u00a0', ' ')} ₽`));
  const masterCards = [...html.matchAll(/<article class="service-master-card">([\s\S]*?)<\/article>/g)];
  const masterIds = masterCards.map((match) => match[1].match(/href="https:\/\/dikidi\.net\/2038825\?[^"<>]*\bm=(\d+)/)?.[1]);
  assert.deepEqual(masterIds, spec.masters, `Master destinations match the service on ${spec.slug}`);
  const background = landing.match(new RegExp(`id="${spec.section}" data-background="([^"]+)"`))?.[1];
  assert(background, `Service illustration is present on the landing: ${spec.slug}`);
  assert(html.includes(`src="/${background}"`), `Service illustration matches the landing: ${spec.slug}`);
  assert(html.includes(`property="og:image" content="${origin}/${background}"`), `Social image matches the service: ${spec.slug}`);
  assert.equal((html.match(/class="portfolio-photo"/g) || []).length, spec.photos);
  if (!spec.photos) {
    assert.equal((html.match(/class="service-work-placeholder"/g) || []).length, 3);
    assert(!/data-src="\/(9|1|2)\.avif"/.test(html), 'Lamination does not reuse extension work');
  }
  assert(sitemap.includes(`<loc>${canonical}</loc>`));
  assert(landing.includes(`href="/${spec.slug}/"`));
  localLinks(html, canonical);
  console.log(`PASS ${spec.slug}: metadata, price, hours, masters, gallery, local links and sitemap`);
}
assert.equal(titles.size, specs.length);
assert.equal(descriptions.size, specs.length);
assert(/name="lashes" value="2200"/.test(landing));
assert(/id="calculator-total"[^>]*>от 2 200 ₽</.test(landing));
assert(landing.includes('Скидка 10% на первое посещение'));
assert(!/15%|22:00/.test(landing));
assert.equal(scripts(landing).find((item) => item['@type'] === 'BeautySalon').openingHoursSpecification.closes, '21:00');
console.log('PASS landing: confirmed price, 10% offer and closing time 21:00');
