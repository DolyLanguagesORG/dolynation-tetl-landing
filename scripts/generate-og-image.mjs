/**
 * Genera la imagen Open Graph oscura (1200x630) de la landing DolyNation · Tetl
 * usando los assets y tipografías oficiales del proyecto.
 *
 * Uso: node scripts/generate-og-image.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'public', 'images', 'og-dolynation.png');

const [dolyBookBuf, interLatinBuf, serifNormalBuf, serifItalicBuf, monoLatinBuf] = await Promise.all([
  readFile(path.join(root, 'public', 'images', 'doly-book.webp')),
  readFile(path.join(root, 'node_modules', '@fontsource-variable', 'inter-tight', 'files', 'inter-tight-latin-wght-normal.woff2')),
  readFile(path.join(root, 'node_modules', '@fontsource', 'instrument-serif', 'files', 'instrument-serif-latin-400-normal.woff2')),
  readFile(path.join(root, 'node_modules', '@fontsource', 'instrument-serif', 'files', 'instrument-serif-latin-400-italic.woff2')),
  readFile(path.join(root, 'node_modules', '@fontsource-variable', 'jetbrains-mono', 'files', 'jetbrains-mono-latin-wght-normal.woff2')),
]);

const dolyBookDataUri = `data:image/webp;base64,${dolyBookBuf.toString('base64')}`;
const interFontUri = `data:font/woff2;base64,${interLatinBuf.toString('base64')}`;
const serifFontUri = `data:font/woff2;base64,${serifNormalBuf.toString('base64')}`;
const serifItalicFontUri = `data:font/woff2;base64,${serifItalicBuf.toString('base64')}`;
const monoFontUri = `data:font/woff2;base64,${monoLatinBuf.toString('base64')}`;

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: 'Inter Tight OG';
        src: url('${interFontUri}') format('woff2');
        font-weight: 100 900;
        font-style: normal;
      }
      @font-face {
        font-family: 'Instrument Serif OG';
        src: url('${serifFontUri}') format('woff2');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Instrument Serif OG';
        src: url('${serifItalicFontUri}') format('woff2');
        font-weight: 400;
        font-style: italic;
      }
      @font-face {
        font-family: 'JetBrains Mono OG';
        src: url('${monoFontUri}') format('woff2');
        font-weight: 100 800;
        font-style: normal;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      html, body {
        width: 1200px;
        height: 630px;
        overflow: hidden;
        background-color: #121212;
        background-image:
          linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
        background-size: 48px 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter Tight OG', sans-serif;
        color: #f5f5f5;
      }

      .card {
        position: relative;
        width: 1104px;
        height: 534px;
        background: #1c1c1c;
        border: 1px solid #333333;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        display: grid;
        grid-template-columns: 372px 1px 1fr;
        align-items: center;
        padding: 48px 54px;
        gap: 44px;
        overflow: hidden;
      }

      .card::before {
        content: '';
        position: absolute;
        inset: 0 0 auto 0;
        height: 4px;
        background: #f5f5f5;
      }

      .mascot-frame {
        width: 372px;
        height: 372px;
        border-radius: 28px;
        background: radial-gradient(circle at 50% 42%, #282828 0%, #141414 78%);
        border: 1px solid #333333;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 26px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      .mascot-frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 14px 24px rgba(0, 0, 0, 0.55));
      }

      .divider {
        width: 1px;
        height: 360px;
        background: #2f2f2f;
      }

      .content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 20px;
      }

      .badge {
        align-self: flex-start;
        background: #f5f5f5;
        color: #121212;
        font-family: 'JetBrains Mono OG', monospace;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        padding: 7px 14px;
        border-radius: 6px;
        text-transform: uppercase;
      }

      .title {
        font-family: 'Instrument Serif OG', serif;
        font-size: 86px;
        font-weight: 400;
        line-height: 0.96;
        letter-spacing: -0.02em;
        color: #f5f5f5;
      }

      .title em {
        font-style: italic;
      }

      .description {
        font-size: 25px;
        line-height: 1.38;
        color: #c7c7c7;
        font-weight: 400;
        max-width: 560px;
      }

      .meta-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 20px;
        border-top: 1px solid #2f2f2f;
      }

      .lang-pill {
        font-family: 'JetBrains Mono OG', monospace;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: #f5f5f5;
        border: 1px solid #444444;
        background: #141414;
        padding: 6px 12px;
        border-radius: 6px;
      }

      .meta-caption {
        margin-left: 8px;
        font-family: 'JetBrains Mono OG', monospace;
        font-size: 13px;
        letter-spacing: 0.14em;
        color: #8c8c8c;
      }

      .tagline {
        font-family: 'Instrument Serif OG', serif;
        font-style: italic;
        font-size: 25px;
        color: #e5e5e5;
        letter-spacing: 0.01em;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="mascot-frame">
        <img src="${dolyBookDataUri}" alt="Doly sobre un libro abierto" />
      </div>
      <div class="divider"></div>
      <section class="content">
        <span class="badge">Tetl · Lectura contextual con IA</span>
        <h1 class="title"><em>DolyNation</em></h1>
        <p class="description">
          Lectura comprensiva de idiomas, vocabulario en contexto y evaluación inteligente por IA.
        </p>
        <div class="meta-row">
          <span class="lang-pill">ES</span>
          <span class="lang-pill">EN</span>
          <span class="lang-pill">FR</span>
          <span class="lang-pill">IT</span>
          <span class="lang-pill">JA</span>
          <span class="meta-caption">CEFR · LECTURAS · PNL</span>
        </div>
        <p class="tagline">Menos memorización aislada. Más comprensión real.</p>
      </section>
    </main>
  </body>
</html>
`;

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'doly-og-'));
try {
  const htmlPath = path.join(tmpDir, 'og.html');
  await writeFile(htmlPath, html, 'utf8');
  execFileSync(
    'chromium',
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1200,630',
      `--screenshot=${outPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'inherit' },
  );
  console.log('✔ og-dolynation.png generado en', outPath);
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}
