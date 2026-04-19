import { useEffect } from 'react';
import { applySeo, applyJsonLd, removeJsonLd, SeoConfig } from '../lib/seo';

interface SeoProps extends SeoConfig {
  jsonLd?: { id: string; data: Record<string, unknown> | Array<Record<string, unknown>> };
}

export default function Seo({ jsonLd, ...cfg }: SeoProps) {
  useEffect(() => {
    applySeo(cfg);
  }, [cfg.title, cfg.description, cfg.path, cfg.noindex, cfg.image, cfg.ogType]);

  useEffect(() => {
    if (!jsonLd) return;
    applyJsonLd(jsonLd.id, jsonLd.data);
    const id = jsonLd.id;
    return () => removeJsonLd(id);
  }, [jsonLd?.id, jsonLd?.data]);

  return null;
}
