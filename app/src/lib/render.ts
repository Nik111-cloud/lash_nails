import type { SiteContent, ImageFields } from '../types/site-content';

export function text(content: SiteContent, key: string, fallback = ''): string {
  const aliases: Record<string, string> = {
    'header.skip': 'skip_services', 'header.nav_aria': 'header_nav_label', 'header.call': 'header_call', 'header.book': 'header_booking',
    'cookie.aria_label': 'cookie_label', 'cookie.description': 'cookie_intro', 'cookie.policy_link': 'cookie_link',
    'hero.aria_label': 'hero_label', 'hero.slide': 'hero_slide_template',
    'services.description': 'services_intro', 'services.book': 'service_cta',
    'effects.description': 'effects_intro', 'portfolio.description': 'portfolio_intro', 'portfolio.aria_label': 'portfolio_label',
    'reviews.description': 'reviews_intro', 'reviews.aria_label': 'reviews_label',
  };
  const lookup = aliases[key] || key.replace(/\./g, '_');
  return content.site_texts.find((item) => item.key === lookup)?.value ?? fallback;
}

export function href(value: string | null | undefined, fallback = '#'): string {
  const allowed = (input: unknown): string | undefined => {
    if (typeof input !== 'string' || /[\u0000-\u001f\u007f-\u009f\\]/.test(input)) return;
    const trimmed = input.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (['https:', 'http:'].includes(url.protocol)) return trimmed;
      } catch { return; }
    }
    if (/^(tel:|mailto:)/i.test(trimmed) || /^(\/(?!\/)|#|\.\.?\/)/.test(trimmed)) return trimmed;
  };
  return allowed(value) ?? (fallback === '' ? '' : allowed(fallback)) ?? '#';
}

/** Existing CMS links for this studio use the shared booking widget. */
export function bookingHref(value: string | null | undefined, fallback = 'https://dikidi.net/#widget=221383'): string {
  const destination = href(value, fallback);
  try {
    const url = new URL(destination);
    if (url.hostname === 'dikidi.net' && /^\/2038825\/?$/.test(url.pathname)) return 'https://dikidi.net/#widget=221383';
  } catch { /* Keep other destinations subject to the normal safe-link rules. */ }
  return destination;
}

export function media(item: ImageFields): string {
  const file = item.image_file;
  const id = typeof file === 'string' ? file : file?.id;
  if (id) {
    const base = (import.meta.env.PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055').replace(/\/$/, '');
    const source = href(`${base}/estetika/media/${encodeURIComponent(id)}`, '');
    if (!source || !/^https?:\/\//i.test(source)) return '';
    const modified = typeof file === 'object' ? file?.modified_on : undefined;
    return `${source}${modified ? `?v=${encodeURIComponent(modified)}` : ''}`;
  }
  const path = (item.image_path || '').trim();
  if (!path || /[\u0000-\u001f\u007f-\u009f\\]/.test(path) || path.startsWith('//') || path.startsWith('#')) return '';
  if (/^https?:\/\//i.test(path)) return href(path, '');
  if (path.includes(':')) return '';
  return `/${path.replace(/^\/+/, '')}`;
}

export function price(content: SiteContent, value: number): string {
  return text(content, 'service_price_template', 'от {sum} ₽').replaceAll('{sum}', new Intl.NumberFormat('ru-RU').format(value));
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}
