import type { APIRoute } from 'astro';
import { buildCanonicalUrl } from '../lib/seo';

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = buildCanonicalUrl('/sitemap.xml', site);
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
