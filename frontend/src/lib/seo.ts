export const SITE_URL = 'https://fornaxelit.com';
export const SITE_NAME = 'Web Work';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface SeoConfig {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  image?: string;
  ogType?: 'website' | 'article';
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applySeo(cfg: SeoConfig): () => void {
  const url = `${SITE_URL}${cfg.path.startsWith('/') ? cfg.path : `/${cfg.path}`}`;
  const image = cfg.image || DEFAULT_OG_IMAGE;
  const ogType = cfg.ogType || 'website';

  document.title = cfg.title;

  upsertMeta('meta[name="description"]', 'name', 'description', cfg.description);
  upsertMeta(
    'meta[name="robots"]',
    'name',
    'robots',
    cfg.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
  );

  upsertMeta('meta[property="og:title"]', 'property', 'og:title', cfg.title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', cfg.description);
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
  upsertMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
  upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);

  upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', cfg.title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', cfg.description);
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);

  upsertLink('canonical', url);

  return () => {
    /* intentionally left blank — next applySeo overwrites values */
  };
}

const JSONLD_ATTR = 'data-seo-jsonld';

export function applyJsonLd(id: string, data: Record<string, unknown> | Array<Record<string, unknown>>) {
  const selector = `script[type="application/ld+json"][${JSONLD_ATTR}="${id}"]`;
  let el = document.head.querySelector<HTMLScriptElement>(selector);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute(JSONLD_ATTR, id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function removeJsonLd(id: string) {
  const selector = `script[type="application/ld+json"][${JSONLD_ATTR}="${id}"]`;
  const el = document.head.querySelector(selector);
  if (el) el.remove();
}
