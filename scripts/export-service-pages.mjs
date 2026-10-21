// Export only service pages: the published landing and policy remain their own sources.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const slugs = ['narashchivanie-resnits', 'laminirovanie-resnits', 'manikyur'];
const domain = (await readFile(path.join(root, 'CNAME'), 'utf8')).trim();
const origin = `https://${domain}`;
// Validate every input before writing any published file.
const pages = await Promise.all(slugs.map(async (slug) => {
  const html = await readFile(path.join(root, 'app', 'dist', slug, 'index.html'), 'utf8');
  if (!html.includes(`${origin}/${slug}/`)) throw new Error(`Unexpected canonical for ${slug}`);
  if (!html.includes('mc.yandex.ru/metrika/tag.js?id=113129252')) throw new Error('Build with PUBLIC_ENABLE_ANALYTICS=true before exporting.');
  if (/\/(?:_astro|@vite)\//.test(html)) throw new Error('Unexpected generated runtime asset; add an explicit export before publishing.');
  return {slug, html};
}));
const dataScript = pages[0].html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
const salon = dataScript && JSON.parse(dataScript[1])['@graph'].find((item) => item['@type'] === 'BeautySalon');
if (!salon) throw new Error('Missing salon structured data.');
let landing = await readFile(path.join(root, 'index.html'), 'utf8');
const schema = `<script id="salon-structured-data" type="application/ld+json">${JSON.stringify({'@context': 'https://schema.org', ...salon}).replace(/</g, '\\u003c')}</script>`;
landing = landing.includes('id="salon-structured-data"')
  ? landing.replace(/<script id="salon-structured-data"[\s\S]*?<\/script>/, schema)
  : landing.replace('</head>', `${schema}\n</head>`);
for (const {slug, html} of pages) {
  const directory = path.join(root, slug);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'index.html'), `<!-- Generated from app/src/components/ServiceDetail.astro; see SERVICE_PAGES.md. -->\n${html}`);
}
await writeFile(path.join(root, 'index.html'), landing);
let sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const additions = slugs.filter((slug) => !sitemap.includes(`<loc>${origin}/${slug}/</loc>`))
  .map((slug) => `  <url>\n    <loc>${origin}/${slug}/</loc>\n  </url>\n`).join('');
if (additions) await writeFile(path.join(root, 'sitemap.xml'), sitemap.replace('</urlset>', `${additions}</urlset>`));
console.log(`Exported ${pages.length} service pages, salon data and sitemap.xml.`);
