/**
 * ==================================================================
 *  METADATOS SEO, OPEN GRAPH Y DATOS ESTRUCTURADOS — DolyNation
 * ==================================================================
 *  Centraliza la construcción de URLs canónicas, recursos sociales
 *  (Open Graph / Twitter Cards) y JSON-LD (`Organization`, `WebSite`
 *  y `WebApplication`) para la landing estática.
 * ==================================================================
 */
import { brand, seo, welcomeLanguages } from '../data/landing.ts';
import { DEFAULT_PROD_APP_URL } from './appUrls.ts';

export const SITE_NAME = brand.name;
export const DEFAULT_SITE_URL = 'https://dolynation.app';
export const OG_IMAGE_PATH = '/images/og-dolynation.png';
export const ORGANIZATION_LOGO_PATH = '/icons/icon-512.png';
export const OG_IMAGE_DIMENSIONS = {
  width: 1200,
  height: 630,
} as const;

export const OPEN_GRAPH_LOCALE = 'es_MX';
export const OPEN_GRAPH_ALTERNATE_LOCALES = ['en_US', 'fr_FR', 'it_IT'] as const;

/**
 * Resuelve la URL base del sitio de marketing a partir de `Astro.site` o
 * de un respaldo seguro de producción.
 */
export function resolveSiteOrigin(site?: URL | string): URL {
  if (site instanceof URL) {
    return new URL(site.origin);
  }
  if (typeof site === 'string' && site.trim()) {
    try {
      const parsed = new URL(site.trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return new URL(parsed.origin);
      }
    } catch {
      // Usa el respaldo por defecto si la cadena no es una URL válida.
    }
  }
  return new URL(DEFAULT_SITE_URL);
}

/**
 * Construye una URL absoluta contra el origen canónico de la landing.
 */
export function buildCanonicalUrl(path: string, site?: URL | string): string {
  const origin = resolveSiteOrigin(site);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, origin).toString();
}

/**
 * Construye el grafo JSON-LD (`Organization` + `WebSite` + `WebApplication`)
 * para buscadores y previsualizaciones enriquecidas.
 */
export function buildSiteStructuredData(site?: URL | string) {
  const origin = resolveSiteOrigin(site).origin;
  const ogImageUrl = buildCanonicalUrl(OG_IMAGE_PATH, origin);
  const logoUrl = buildCanonicalUrl(ORGANIZATION_LOGO_PATH, origin);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: origin,
        logo: {
          '@type': 'ImageObject',
          url: logoUrl,
          width: 512,
          height: 512,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: origin,
        description: seo.description,
        inLanguage: 'es',
        publisher: {
          '@id': `${origin}/#organization`,
        },
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name: SITE_NAME,
        url: DEFAULT_PROD_APP_URL,
        description: seo.description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        inLanguage: welcomeLanguages.map((lang) => lang.code),
        isAccessibleForFree: true,
        image: ogImageUrl,
        publisher: {
          '@id': `${origin}/#organization`,
        },
        potentialAction: {
          '@type': 'ReadAction',
          target: `${DEFAULT_PROD_APP_URL}/login`,
        },
        about: {
          '@type': 'Thing',
          name: 'Aprendizaje de idiomas en contexto',
        },
      },
    ],
  };
}
