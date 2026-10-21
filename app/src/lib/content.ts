import snapshot from '../data/site-content.json';
import type { SiteContent } from '../types/site-content';
import { normalizeContent } from './normalize';

const fallback = snapshot as SiteContent;
let buildContent: Promise<SiteContent> | undefined;
let lastWarning = '';

async function load(): Promise<SiteContent> {
  const mode = import.meta.env.CONTENT_SOURCE || 'cms';
  if (mode === 'snapshot') return structuredClone(fallback);
  const base = (import.meta.env.DIRECTUS_URL || import.meta.env.PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/estetika/content`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Directus website endpoint returned HTTP ${response.status}.`);
    const payload = await response.json();
    const content = normalizeContent(payload.data ?? payload, fallback);
    lastWarning = '';
    return content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!import.meta.env.DEV) throw new Error(`Website build stopped: ${detail} Start Directus or explicitly set CONTENT_SOURCE=snapshot for an offline preview.`);
    if (lastWarning !== detail) console.warn(`[Эстетика] ${detail} Local preview uses the initial snapshot until Directus is ready.`);
    lastWarning = detail;
    return structuredClone(fallback);
  }
}

/** Fetch on each dev request so an admin change appears on browser refresh. */
export async function getSiteContent(): Promise<SiteContent> {
  if (import.meta.env.DEV) return load();
  buildContent ??= load();
  return buildContent;
}
