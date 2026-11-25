/**
 * Utilidades para versionar URLs de manifiestos y spritesheets de Doly con hash
 * de contenido (?v=<hash>), evitando respuestas obsoletas en caché de CDN o navegador.
 */

function hasNonEmptyVersionParam(url: string): boolean {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return false;
  const hashStart = url.indexOf('#', queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const params = new URLSearchParams(query);
  const value = params.get('v');
  return typeof value === 'string' && value.trim().length > 0;
}

function appendVersionParam(url: string, version?: string): string {
  const trimmed = version?.trim();
  if (!trimmed || hasNonEmptyVersionParam(url)) {
    return url;
  }
  const hashStart = url.indexOf('#');
  const base = hashStart === -1 ? url : url.slice(0, hashStart);
  const hash = hashStart === -1 ? '' : url.slice(hashStart);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${encodeURIComponent(trimmed)}${hash}`;
}

/**
 * Conserva el parámetro `?v=` propio de cada spritesheet cuando ya viene definido
 * en el manifiesto y usa `manifestVersion` como respaldo para rutas sin versión.
 */
export function resolveSpriteAssetUrl(assetPath: string, manifestVersion?: string): string {
  return appendVersionParam(assetPath, manifestVersion);
}

/**
 * Construye la URL del manifiesto `doly-walk.json` adjuntando `?v=<version>`
 * cuando existe una versión resuelta en tiempo de compilación.
 */
export function buildSpriteManifestUrl(manifestPath: string, version?: string): string {
  return appendVersionParam(manifestPath, version);
}
