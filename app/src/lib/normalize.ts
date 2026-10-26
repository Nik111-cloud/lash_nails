import { parse, ELEMENT_NODE, TEXT_NODE, type Node, type ElementNode } from 'ultrahtml';
import type { SiteContent, PolicyBlock, TextSegment } from '../types/site-content';

const blockedElements = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);
const namedEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  copy: '©', reg: '®', bull: '•', middot: '·', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
};

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (!entity.startsWith('#')) return namedEntities[entity] ?? whole;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  });
}

export function safePolicyHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const href = decode(value).trim();
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(href)) return;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href) || /^(\/(?!\/)|#|\.\.?\/)/.test(href)) return href;
}

/** Convert the CMS rich editor to escaped text structures, never executable HTML. */
export function parsePolicyHtml(html: string): PolicyBlock[] {
  const document = parse(html.slice(0, 250000)) as Node;
  const blocks: PolicyBlock[] = [];
  const segments = (node: Node, context: { strong?: boolean; href?: string } = {}, depth = 0): TextSegment[] => {
    if (depth > 32) return [];
    if (node.type === TEXT_NODE) return [{ text: decode(node.value), ...context }];
    if (node.type !== ELEMENT_NODE && node.type !== 0) return [];
    if (node.type === ELEMENT_NODE) {
      if (blockedElements.has(node.name.toLowerCase())) return [];
      if (node.name === 'br') return [{ text: '\n', ...context }];
      context = {
        ...context,
        ...(['strong', 'b'].includes(node.name) ? { strong: true } : {}),
        ...(node.name === 'a' && safePolicyHref(node.attributes.href) ? { href: safePolicyHref(node.attributes.href) } : {}),
      };
    }
    return node.children.flatMap((child: Node) => segments(child, context, depth + 1));
  };
  const meaningful = (parts: TextSegment[]) => parts.some((part) => part.text.trim());
  const walk = (node: Node, depth = 0) => {
    if (depth > 32 || (node.type === ELEMENT_NODE && blockedElements.has(node.name.toLowerCase()))) return;
    if (node.type === TEXT_NODE) {
      const parts = segments(node);
      if (meaningful(parts)) blocks.push({ type: 'paragraph', segments: parts });
      return;
    }
    if (node.type !== ELEMENT_NODE && node.type !== 0) return;
    if (node.type === ELEMENT_NODE && ['ul', 'ol'].includes(node.name)) {
      const items = node.children.filter((child): child is ElementNode => child.type === ELEMENT_NODE && child.name === 'li').map((child) => segments(child));
      if (items.some(meaningful)) blocks.push({ type: 'list', items: items.filter(meaningful) });
    } else if (node.type === ELEMENT_NODE && ['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'li'].includes(node.name)) {
      const parts = segments(node);
      if (meaningful(parts)) blocks.push({ type: 'paragraph', segments: parts });
    } else {
      node.children.forEach((child: Node) => walk(child, depth + 1));
    }
  };
  walk(document);
  return blocks;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeBlocks(value: unknown): PolicyBlock[] {
  if (!Array.isArray(value)) return [];
  const segments = (input: unknown): TextSegment[] => Array.isArray(input) ? input.slice(0, 1000).flatMap((part) => {
    const item = object(part);
    if (typeof item.text !== 'string') return [];
    return [{ text: item.text.slice(0, 50000), ...(item.strong === true ? { strong: true } : {}), ...(safePolicyHref(item.href) ? { href: safePolicyHref(item.href) } : {}) }];
  }) : [];
  return value.slice(0, 500).flatMap((entry): PolicyBlock[] => {
    const block = object(entry);
    if (block.type === 'paragraph') return [{ type: 'paragraph', segments: segments(block.segments) }];
    if (block.type === 'list' && Array.isArray(block.items)) return [{ type: 'list', items: block.items.slice(0, 500).map(segments) }];
    return [];
  });
}

/** Accept only the known public content schema and preserve deliberate empty lists. */
export function normalizeContent(input: unknown, fallback: SiteContent): SiteContent {
  const raw = object(input);
  if (!Object.keys(raw).length || !raw.site_settings) throw new Error('Directus returned no website content.');
  const content = structuredClone(fallback);
  const settings = object(raw.site_settings);
  for (const key of Object.keys(content.site_settings) as (keyof SiteContent['site_settings'])[]) {
    if (typeof settings[key] === 'string') content.site_settings[key] = (settings[key] as string).slice(0, 50000);
  }
  if (Array.isArray(raw.site_texts)) {
    const values = new Map(content.site_texts.map((item) => [item.key, item]));
    raw.site_texts.slice(0, 2000).forEach((entry) => {
      const item = object(entry);
      if (typeof item.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(item.key) || typeof item.value !== 'string') return;
      values.set(item.key, { key: item.key, title: typeof item.title === 'string' ? item.title : item.key, group: typeof item.group === 'string' ? item.group : '', value: item.value.slice(0, 50000) });
    });
    content.site_texts = [...values.values()];
  }
  const names = ['hero_slides', 'services', 'lash_effects', 'portfolio_items', 'review_items', 'masters', 'studio_photos', 'calculator_options', 'policy_sections'] as const;
  for (const name of names) {
    if (!Array.isArray(raw[name])) throw new Error(`Directus content is missing ${name}.`);
    const seedRows = fallback[name] as unknown as Record<string, unknown>[];
    const template = seedRows[0] || {};
    const rows = (raw[name] as unknown[]).slice(0, 2000).flatMap((entry) => {
      const record = object(entry);
      if (!Object.keys(record).length || record.archived === true) return [];
      const seeded = seedRows.find((row) => row.id === record.id || (row.key && row.key === record.key) || (row.slug && row.slug === record.slug));
      const result: Record<string, unknown> = {};
      for (const [field, original] of Object.entries(template)) {
        const value = Object.hasOwn(record, field) ? record[field] : seeded?.[field];
        if (field.endsWith('_file')) {
          if (typeof value === 'string') result[field] = value;
          else {
            const file = object(value);
            result[field] = typeof file.id === 'string' ? { id: file.id, width: file.width, height: file.height, modified_on: file.modified_on } : null;
          }
        } else if (field === 'features') result[field] = Array.isArray(value) ? value.filter((part) => typeof part === 'string').slice(0, 100).map((part) => part.slice(0, 5000)) : [];
        else if (field === 'blocks') result[field] = normalizeBlocks(value);
        else if (typeof original === 'string') result[field] = typeof value === 'string' ? value.slice(0, 50000) : '';
        else if (typeof original === 'number') result[field] = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
        else if (typeof original === 'boolean') result[field] = typeof value === 'boolean' ? value : false;
        else result[field] = value ?? null;
      }
      if (name === 'policy_sections' && typeof record.body === 'string') result.blocks = parsePolicyHtml(record.body);
      // Hidden technical keys for new cards are derived from their stable UUID.
      const identity = typeof record.id === 'string' ? record.id.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      if (!identity) return [];
      if (name === 'services') {
        result.key ||= `service_${identity}`;
        result.slug ||= `service-${identity}`;
      }
      if (name === 'policy_sections') result.slug ||= `section-${identity}`;
      if (name === 'calculator_options') {
        result.key ||= `option_${identity}`;
        result.service_slug ||= 'brows';
      }
      // New uploads use their own dimensions, rather than the original photograph's.
      const file = object(result.image_file);
      if (Number(file.width) > 0) result.image_width = Number(file.width);
      if (Number(file.height) > 0) result.image_height = Number(file.height);
      return [result];
    }).sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0));
    (content[name] as unknown) = rows;
  }
  // Cards show the least expensive complete treatment; add-ons are not standalone prices.
  for (const service of content.services) {
    const variants = content.calculator_options.filter((option) => option.service_slug === service.slug && !option.is_addon);
    if (variants.length) service.price_from = Math.min(...variants.map((option) => option.price_from));
  }
  return content;
}
