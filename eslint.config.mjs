// ESLint (flat config) de la landing de DolyNation.
//
// Tres cosas se comprueban aqui:
//
//   1. JavaScript/TypeScript plano (reglas de `js` y de `typescript-eslint`).
//   2. Los componentes `.astro` (reglas de `eslint-plugin-astro`).
//   3. Los scripts de la escena 3D, que son TypeScript con WebGL y Three.js.
//
// Lo que NO se mira (esta en el `.gitignore` o es generado):
//   `dist/`      -> la salida del build.
//   `.astro/`    -> los tipos que genera Astro.
//   `public/`    -> recursos estaticos (imagenes, sprites, fuentes).
//   `assets-src/`-> los originales de los sprites (se procesan con un script).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      'public/**',
      'assets-src/**',
      'src/generated/**',
    ],
  },

  js.configs.recommended,
  // El orden importa: `typescript-eslint` define `languageOptions` sin
  // `files`, asi que si va DESPUES de Astro se lleva el parser de las
  // plantillas y los `.astro` dejan de analizarse ("Parsing error").
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],

  {
    rules: {
      // TypeScript ya sabe si una variable existe: `no-undef` da falsos
      // positivos con los tipos de Astro y con los globals de Three.js.
      'no-undef': 'off',
    },
  },

  // --- Archivos CommonJS (`.cjs`) --------------------------------------
  // Los scripts de la CI (`.github/workflows/*.cjs`) son CommonJS a
  // proposito: los ejecuta Node directamente, sin empaquetar. `require()`
  // es lo correcto en ellos.
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // --- TypeScript y Astro -----------------------------------------------
  // El codigo de la escena 3D implementa interfaces (Timeline, Scene, etc.)
  // cuyas firmas tienen parametros que cada implementacion no usa. Eso NO es
  // un error: es la firma del contrato. Por eso:
  //
  //   - los parametros sin usar no se reportan (`args: 'none'`),
  //   - `no-unused-vars` (la regla base de JS) se apaga y deja el sitio a
  //     `@typescript-eslint/no-unused-vars`, que entiende los tipos,
  //   - `no-useless-assignment` queda como aviso, no como error: hay
  //     asignaciones intermedias que el codigo todavia no limpia, y
  //     bloquear el CI por eso frenaria al equipo sin ganar nada.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.astro'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-useless-assignment': 'warn',
    },
  },
];
