/**
 * ==================================================================
 *  RESOLUCIÓN DE URLS DE LA APLICACIÓN POR ENTORNO — DolyNation
 * ==================================================================
 *  La landing es un sitio estático (una imagen inmutable por SHA que
 *  se promueve de rehearsal -> staging -> prod). Por eso las URLs hacia
 *  la app (play / stagingweb / devweb / local) no se fijan en el build:
 *  se resuelven en el siguiente orden de prioridad:
 *    1. `window.__DOLY_CONFIG__.appBaseUrl` (inyectado al arrancar el
 *       contenedor Docker en `/runtime-config.js` vía `APP_BASE_URL`).
 *    2. `import.meta.env.PUBLIC_APP_BASE_URL` (override opcional en dev).
 *    3. Mapa automático según `window.location.hostname` (y puerto para
 *       rehearsal en 127.0.0.1:57043).
 *    4. Fallback estático de producción (`https://play.dolynation.app`)
 *       para SSR y crawlers.
 * ==================================================================
 */

export const DEFAULT_PROD_APP_URL = 'https://play.dolynation.app';

export const HOSTNAME_APP_URL_MAP: Record<string, string> = {
  'devsite.dolynation.app': 'https://devweb.dolynation.app',
  'staging.dolynation.app': 'https://stagingweb.dolynation.app',
  'stagingsite.dolynation.app': 'https://stagingweb.dolynation.app',
  'dolynation.app': DEFAULT_PROD_APP_URL,
  'www.dolynation.app': DEFAULT_PROD_APP_URL,
};

export interface ResolveAppBaseUrlOptions {
  runtimeOverride?: string;
  envOverride?: string;
  hostname?: string;
  port?: string;
}

function normalizeHttpUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return undefined;
  }
  return trimmed;
}

/**
 * Resuelve la URL base de la aplicación según la configuración inyectada en
 * runtime, variables públicas o el hostname actual de la landing.
 */
export function resolveAppBaseUrl(options: ResolveAppBaseUrlOptions = {}): string {
  const fromRuntime = normalizeHttpUrl(options.runtimeOverride);
  if (fromRuntime) return fromRuntime;

  const fromEnv = normalizeHttpUrl(options.envOverride);
  if (fromEnv) return fromEnv;

  const hostname = options.hostname?.trim().toLowerCase();
  if (hostname) {
    const mapped = HOSTNAME_APP_URL_MAP[hostname];
    if (mapped) return mapped;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return options.port?.trim() === '57043'
        ? 'http://127.0.0.1:57042'
        : 'http://localhost:3000';
    }
  }

  return DEFAULT_PROD_APP_URL;
}

/**
 * Construye una URL absoluta hacia la aplicación preservando la ruta indicada.
 */
export function buildAppUrl(path: string, baseUrl: string = DEFAULT_PROD_APP_URL): string {
  const cleanBase = normalizeHttpUrl(baseUrl) ?? DEFAULT_PROD_APP_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${normalizedPath}`;
}

/**
 * Actualiza los enlaces marcados con `data-app-path` según el entorno activo.
 */
export function hydrateAppLinks(root: Document = document): void {
  const win = window as Window & {
    __DOLY_CONFIG__?: { appBaseUrl?: string };
  };
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

  const baseUrl = resolveAppBaseUrl({
    runtimeOverride: win.__DOLY_CONFIG__?.appBaseUrl,
    envOverride: metaEnv?.PUBLIC_APP_BASE_URL,
    hostname: window.location.hostname,
    port: window.location.port,
  });

  const links = root.querySelectorAll<HTMLAnchorElement>('a[data-app-path]');
  for (const link of links) {
    const appPath = link.dataset.appPath;
    if (appPath) {
      link.setAttribute('href', buildAppUrl(appPath, baseUrl));
    }
  }
}
