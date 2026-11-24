# Propuesta Editorial, Tipográfica y de Animación de Textos — DolyNation Tetl

Todos los textos de la landing viven centralizados en [`src/data/landing.ts`](../src/data/landing.ts) para que puedas editarlos en un solo archivo sin tocar componentes ni animaciones.

---

## 1. Sistema Tipográfico (Editorial Monocromático)

| Rol | Fuente | Uso en la Landing |
| :--- | :--- | :--- |
| **Display & Cuerpo (`--font-sans`)** | `Inter Tight Variable` | Títulos principales, párrafos y botones con tracking ajustado (`-0.035em`). |
| **Acento Lingüístico (`--font-serif`)** | `Instrument Serif` (Itálica) | La marca *DolyNation*, números monumentales de capítulo y palabras clave traducibles. |
| **Metadatos & Fonética (`--font-mono`)** | `JetBrains Mono Variable` | Códigos de idioma (`ES`, `EN`, `FR`, `IT`, `JA`…), glosas interlineales y rastro de palabras en el camino. |

---

## 2. El Título Rotativo Multilenguaje y su "Rastro de Aprendizaje"

En lugar de cambiar todo el título de golpe, se mantiene ***DolyNation*** en serif itálica como **ancla visual** y solo se transforma el saludo alrededor de ella (`prefix` / `suffix` en `welcomeLanguages` dentro de `src/data/landing.ts`):

* **Español (`ES`):** `Bienvenido a DolyNation`
* **Inglés (`EN`):** `Welcome to DolyNation`
* **Francés (`FR`):** `Bienvenue sur DolyNation`
* **Italiano (`IT`):** `Benvenuto su DolyNation`
* **Japonés (`JA`):** `DolyNationへようこそ` *(respeta la gramática japonesa colocando la partícula y saludo al final)*
* **Portugués (`PT`):** `Bem-vindo à DolyNation`
* **Alemán (`DE`):** `Willkommen bei DolyNation`
* **Coreano (`KO`):** `DolyNation에 오신 것을 환영합니다`
* **Chino (`ZH`):** `欢迎来到 DolyNation`
* **Náhuatl (`NAH`):** `Ximopanōlti DolyNation` *(guiño cultural a **Tetl**)*

### Animaciones del título (`src/scripts/text/LanguageTitle.ts`)
1. **Decodificación de glifos (*Glyph Morphing*):** Al cambiar de idioma, las letras pasan durante `520ms` por glifos multilingües (latinos, kana, kanji, devanagari) antes de resolverse en el nuevo idioma.
2. **Camino de idiomas visitados:** Debajo del título aparece la cadena `ES — EN — FR — IT — JA — PT — DE — KO — ZH — NAH`. Cada idioma por el que pasa el título queda iluminado (`is-visited`) y el usuario también puede hacer clic en cualquiera para saltar a él.
3. **Eco fantasma (*Ghost Echo*):** Cada vez que un idioma se completa, se desprende un eco tipográfico sutil hacia arriba (`ES · Bienvenido a DolyNation`) simbolizando una frase que ya quedó aprendida.

---

## 3. Glosas Interlineales Animadas (`[palabra|trad1|trad2|...]`)

En cualquier título de capítulo o del CTA final dentro de `src/data/landing.ts`, puedes escribir corchetes con traducciones separadas por `|`:

```ts
title: 'Cada [palabra|word|mot|parola|言葉] es un paso.'
```

El componente `RichTitle.astro` convierte automáticamente esa palabra a **serif itálica subrayada** y coloca encima una **glosa interlineal en monoespaciada** que rota suavemente cada `2.4s` entre sus traducciones (`word` → `mot` → `parola` → `言葉`).

---

## 4. Rastro de Huellas + Palabras en el Camino de Doly

A medida que la perrita camina de izquierda a derecha sobre la línea horizontal:
* Cada punto del camino que Doly pisa **enciende una huella junto con un saludo en otro idioma** (`hola`, `hello`, `bonjour`, `ciao`, `こんにちは`, `olá`, `hallo`, `你好`, `안녕`, `niltze`…).
* Las huellas recién pisadas brillan con mayor intensidad y las anteriores permanecen encendidas como un rastro visible de todo el recorrido.
