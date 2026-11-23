#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PROD_APP_URL,
  buildAppUrl,
  resolveAppBaseUrl,
} from '../src/lib/appUrls.ts';

test('resolveAppBaseUrl maps known hostnames to environment app URLs', () => {
  assert.equal(
    resolveAppBaseUrl({ hostname: 'dev.dolynation.app' }),
    'https://devplay.dolynation.app',
  );
  assert.equal(
    resolveAppBaseUrl({ hostname: 'staging.dolynation.app' }),
    'https://stagingplay.dolynation.app',
  );
  assert.equal(
    resolveAppBaseUrl({ hostname: 'dolynation.app' }),
    'https://play.dolynation.app',
  );
  assert.equal(
    resolveAppBaseUrl({ hostname: 'WWW.DOLYNATION.APP' }),
    'https://play.dolynation.app',
  );
});

test('resolveAppBaseUrl handles localhost and rehearsal ports', () => {
  assert.equal(
    resolveAppBaseUrl({ hostname: 'localhost', port: '4321' }),
    'http://localhost:3000',
  );
  assert.equal(
    resolveAppBaseUrl({ hostname: '127.0.0.1', port: '57043' }),
    'http://127.0.0.1:57042',
  );
});

test('resolveAppBaseUrl prioritizes runtimeOverride over envOverride and hostname', () => {
  assert.equal(
    resolveAppBaseUrl({
      runtimeOverride: 'https://stagingplay.dolynation.app/',
      envOverride: 'https://devplay.dolynation.app',
      hostname: 'dolynation.app',
    }),
    'https://stagingplay.dolynation.app',
  );

  assert.equal(
    resolveAppBaseUrl({
      runtimeOverride: '',
      envOverride: 'https://devplay.dolynation.app/',
      hostname: 'dolynation.app',
    }),
    'https://devplay.dolynation.app',
  );
});

test('resolveAppBaseUrl falls back to production URL for unknown hosts or invalid overrides', () => {
  assert.equal(resolveAppBaseUrl({}), DEFAULT_PROD_APP_URL);
  assert.equal(
    resolveAppBaseUrl({
      runtimeOverride: 'javascript:alert(1)',
      hostname: 'unknown.example.com',
    }),
    DEFAULT_PROD_APP_URL,
  );
});

test('buildAppUrl normalizes slashes cleanly', () => {
  assert.equal(
    buildAppUrl('/register', 'https://devplay.dolynation.app/'),
    'https://devplay.dolynation.app/register',
  );
  assert.equal(
    buildAppUrl('login', 'https://stagingplay.dolynation.app'),
    'https://stagingplay.dolynation.app/login',
  );
});
