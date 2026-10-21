import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.estetika-ufa.online',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
