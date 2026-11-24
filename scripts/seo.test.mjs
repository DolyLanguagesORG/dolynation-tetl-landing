#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SITE_URL,
  OG_IMAGE_DIMENSIONS,
  OG_IMAGE_PATH,
  ORGANIZATION_LOGO_PATH,
  SITE_NAME,
  buildCanonicalUrl,
  buildSiteStructuredData,
  resolveSiteOrigin,
} from '../src/lib/seo.ts';

test('resolveSiteOrigin uses valid Astro site URL or falls back to production domain', () => {
  assert.equal(resolveSiteOrigin(new URL('https://dolynation.app/foo')).origin, DEFAULT_SITE_URL);
  assert.equal(resolveSiteOrigin('https://staging.dolynation.app/bar').origin, 'https://staging.dolynation.app');
  assert.equal(resolveSiteOrigin('invalid-url').origin, DEFAULT_SITE_URL);
  assert.equal(resolveSiteOrigin(undefined).origin, DEFAULT_SITE_URL);
});

test('buildCanonicalUrl resolves absolute URLs for OG and canonical tags', () => {
  assert.equal(buildCanonicalUrl('/', new URL(DEFAULT_SITE_URL)), 'https://dolynation.app/');
  assert.equal(
    buildCanonicalUrl(OG_IMAGE_PATH, new URL(DEFAULT_SITE_URL)),
    'https://dolynation.app/images/og-dolynation.png',
  );
  assert.equal(
    buildCanonicalUrl('sitemap.xml', 'https://dolynation.app'),
    'https://dolynation.app/sitemap.xml',
  );
});

test('buildSiteStructuredData returns Organization, WebSite, and WebApplication graph', () => {
  const data = buildSiteStructuredData(DEFAULT_SITE_URL);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@graph'].length, 3);

  const [org, website, webapp] = data['@graph'];
  assert.equal(org['@type'], 'Organization');
  assert.equal(org.name, SITE_NAME);
  assert.equal(org.logo.url, `${DEFAULT_SITE_URL}${ORGANIZATION_LOGO_PATH}`);

  assert.equal(website['@type'], 'WebSite');
  assert.equal(website.url, DEFAULT_SITE_URL);

  assert.equal(webapp['@type'], 'WebApplication');
  assert.equal(webapp.image, `${DEFAULT_SITE_URL}${OG_IMAGE_PATH}`);
  assert.equal(OG_IMAGE_DIMENSIONS.width, 1200);
  assert.equal(OG_IMAGE_DIMENSIONS.height, 630);
});
