import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// During migration the production landing remains the source of shared assets.
// Only explicit public assets are copied; configuration and source files stay out.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const filenames = new Set([
  'styles.css', 'service-pages.css', 'site.js', 'metrika-client.js', 'favicon.svg', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png',
  'robots.txt', 'sitemap.xml', 'yandex_f4ef4dc56aee956f.html',
]);
const mediaExtensions = new Set(['.avif', '.webp', '.jpg', '.jpeg', '.png']);

await mkdir(publicDirectory, { recursive: true });
let copied = 0;
for (const entry of await readdir(repository, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!filenames.has(entry.name) && !mediaExtensions.has(path.extname(entry.name).toLowerCase())) continue;
  await cp(path.join(repository, entry.name), path.join(publicDirectory, entry.name));
  copied += 1;
}
await cp(path.join(repository, 'fonts'), path.join(publicDirectory, 'fonts'), { recursive: true });
await mkdir(path.join(publicDirectory, 'policy'), { recursive: true });
await cp(path.join(repository, 'policy', 'policy.css'), path.join(publicDirectory, 'policy', 'policy.css'));
// Astro uses CMS-aware behaviour; the currently published landing keeps its scripts.
for (const name of ['site.js', 'metrika-client.js']) {
  await cp(fileURLToPath(new URL(`../src/scripts/${name}`, import.meta.url)), path.join(publicDirectory, name));
}
console.log(`Public assets synchronized: ${copied} files, fonts and policy styles.`);
