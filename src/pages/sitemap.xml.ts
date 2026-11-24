import type { APIRoute } from 'astro';
import { OG_IMAGE_PATH, buildCanonicalUrl } from '../lib/seo';

export const GET: APIRoute = ({ site }) => {
  const homeUrl = buildCanonicalUrl('/', site);
  const ogImageUrl = buildCanonicalUrl(OG_IMAGE_PATH, site);
  const lastmod = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${homeUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${ogImageUrl}</image:loc>
    </image:image>
  </url>
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
