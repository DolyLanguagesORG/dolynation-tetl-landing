/**
 * ==================================================================
 *  TEXTOS EDITABLES DE LA LANDING  (placeholders)
 * ==================================================================
 *  Todo el copy vive aquí para que puedas cambiarlo sin tocar los
 *  componentes ni las animaciones. Ver docs/PROPUESTA-TEXTOS.md
 *  para la guía de tono, longitud recomendada y animaciones.
 * ==================================================================
 */

export interface WelcomeLanguage {
  /** código BCP-47 (se aplica como atributo lang) */
  code: string;
  /** etiqueta corta que se muestra en el "camino de idiomas" */
  tag: string;
  /** nombre del idioma en su propio idioma */
  native: string;
  /** texto antes de la marca */
  prefix: string;
  /** texto después de la marca */
  suffix: string;
}

export const brand = {
  name: 'DolyNation',
  product: 'Tetl',
};

/**
 * Título rotativo de bienvenida. La marca "DolyNation" se mantiene fija
 * y solo se transforma el saludo alrededor de ella.
 */
export const welcomeLanguages: WelcomeLanguage[] = [
  { code: 'es', tag: 'ES', native: 'Español', prefix: 'Bienvenido a ', suffix: '' },
  { code: 'en', tag: 'EN', native: 'English', prefix: 'Welcome to ', suffix: '' },
  { code: 'fr', tag: 'FR', native: 'Français', prefix: 'Bienvenue sur ', suffix: '' },
  { code: 'it', tag: 'IT', native: 'Italiano', prefix: 'Benvenuto su ', suffix: '' },
  { code: 'ja', tag: 'JA', native: '日本語', prefix: '', suffix: 'へようこそ' },
  { code: 'pt', tag: 'PT', native: 'Português', prefix: 'Bem-vindo à ', suffix: '' },
  { code: 'de', tag: 'DE', native: 'Deutsch', prefix: 'Willkommen bei ', suffix: '' },
  { code: 'ko', tag: 'KO', native: '한국어', prefix: '', suffix: '에 오신 것을 환영합니다' },
  { code: 'zh', tag: 'ZH', native: '中文', prefix: '欢迎来到 ', suffix: '' },
  // Náhuatl (guiño a "Tetl"). Validar con hablante nativo antes de publicar.
  { code: 'nah', tag: 'NAH', native: 'Nāhuatl', prefix: 'Ximopanōlti ', suffix: '' },
];

export const hero = {
  eyebrow: 'DolyNation · Tetl — Aprende idiomas',
  subtitle: 'Aprende idiomas paso a paso, con historias que se quedan contigo.',
  scrollCue: 'Desliza para empezar el camino',
};

export interface Chapter {
  id: string;
  index: string;
  eyebrow: string;
  /**
   * Título del capítulo. Usa [palabra|trad1|trad2|...] para marcar una
   * palabra clave con anotación de traducción animada.
   */
  title: string;
  body: string;
  /** ventana del scroll (0–1) en la que el capítulo es visible */
  window: [number, number];
  align: 'left' | 'right';
}

export const chapters: Chapter[] = [
  {
    id: 'first-step',
    index: '01',
    eyebrow: 'El primer paso',
    title: 'Cada [palabra|word|mot|parola|言葉] es un paso.',
    body: 'Doly camina contigo desde tu primera palabra. Sin prisas ni presión: solo constancia, un día a la vez.',
    window: [0.16, 0.39],
    align: 'left',
  },
  {
    id: 'the-pause',
    index: '02',
    eyebrow: 'La pausa',
    title: 'Las [historias|stories|histoires|storie|物語] se aprenden despacio.',
    body: 'Lecturas cortas, vocabulario en contexto y repaso inteligente para que lo que aprendes se quede contigo.',
    window: [0.44, 0.62],
    align: 'right',
  },
  {
    id: 'keep-going',
    index: '03',
    eyebrow: 'El camino sigue',
    title: 'Un idioma nunca termina. [Continúa|continues|continue|continua|続く].',
    body: 'Avanza a tu ritmo, cambia de idioma cuando quieras y vuelve al inicio las veces que lo necesites.',
    window: [0.67, 0.9],
    align: 'left',
  },
];

/** Palabras que deja Doly como "rastro" en su camino (huellas) */
export const trailWords = [
  'hola',
  'hello',
  'bonjour',
  'ciao',
  'こんにちは',
  'olá',
  'hallo',
  '你好',
  '안녕',
  'niltze',
  'привет',
  'merhaba',
  'hej',
  'γεια',
  'salut',
  'namaste',
];

export const cta = {
  eyebrow: 'Tu turno',
  title: 'Empieza tu [camino|path|chemin|cammino|道] hoy.',
  body: 'Elige un idioma, da el primer paso y deja que Doly te acompañe el resto del recorrido.',
  primary: { label: 'Comenzar gratis', href: '#' },
  secondary: { label: 'Ver idiomas', href: '#' },
};

export const nav = [
  { label: 'Idiomas', href: '#' },
  { label: 'Método', href: '#' },
  { label: 'Comunidad', href: '#' },
];

export const footer = {
  note: 'Hecho con paciencia, café y muchas palabras nuevas.',
};
