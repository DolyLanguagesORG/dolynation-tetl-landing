/**
 * ==================================================================
 *  CONTENIDO OFICIAL DE LA LANDING — DolyNation · Tetl / Dolynglish
 * ==================================================================
 *  Copy editorial conciso y de alto impacto visual para Scrollytelling.
 *  Centralizado aquí para edición rápida sin tocar componentes ni GSAP.
 * ==================================================================
 */

export interface WelcomeLanguage {
  code: string;
  tag: string;
  native: string;
  prefix: string;
  suffix: string;
}

export const brand = {
  name: 'DolyNation',
  product: 'Tetl · Dolynglish',
};

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
  { code: 'nah', tag: 'NAH', native: 'Nāhuatl', prefix: 'Ximopanōlti ', suffix: '' },
];

export const hero = {
  eyebrow: 'DolyNation · Aprendizaje contextual con IA',
  subtitle: 'Menos memorización aislada. Más comprensión real dentro del texto.',
  scrollCue: 'Desliza para recorrer el camino con Doly',
};

export interface SectionCard {
  tag: string;
  title: string;
  description: string;
}

export interface ComparisonPoint {
  traditional: string;
  dolynation: string;
}

export interface StorySection {
  id: string;
  index: string;
  navLabel: string;
  eyebrow: string;
  /** Usa [palabra|trad1|trad2|...] para glosas interlineales animadas */
  title: string;
  lead: string;
  cards?: SectionCard[];
  comparisons?: ComparisonPoint[];
  badge?: string;
}

export const storySections: StorySection[] = [
  {
    id: 'problema',
    index: '01',
    navLabel: 'El Problema',
    eyebrow: '¿Qué problema resuelve?',
    title: 'Jugar no siempre es aprender un [idioma|language|langue|lingua|言語].',
    lead: 'Las rachas y puntos motivan al inicio, pero pronto frenan tu fluidez real.',
    cards: [
      {
        tag: '01 · Gamificación',
        title: 'Más juego que comprensión',
        description: 'Útil para empezar, insuficiente para dominar el idioma.',
      },
      {
        tag: '02 · Aislamiento',
        title: 'Palabras sin contexto',
        description: 'Memorizar términos sueltos no enseña a usarlos en una conversación.',
      },
      {
        tag: '03 · Estancamiento',
        title: 'Techo de aprendizaje',
        description: 'Ejercicios repetitivos que dejan de retarte con el tiempo.',
      },
    ],
  },
  {
    id: 'que-es',
    index: '02',
    navLabel: '¿Qué es?',
    eyebrow: '¿Qué es DolyNation?',
    title: 'El [texto|text|texte|testo|文章] como centro de todo.',
    lead: 'Una plataforma donde lectura, vocabulario y gramática viven en una misma historia.',
    badge: 'Lectura + Vocabulario + Gramática + IA',
    cards: [
      {
        tag: 'En Contexto',
        title: 'Historias vivas con IA',
        description: 'Aprende cómo funcionan las palabras dentro de lecturas completas.',
      },
      {
        tag: 'Siguiente Nivel',
        title: 'Supera lo básico',
        description: 'Diseñada para dar el salto hacia la comprensión real.',
      },
    ],
  },
  {
    id: 'por-que',
    index: '03',
    navLabel: '¿Por qué elegirnos?',
    eyebrow: '¿Por qué elegir DolyNation?',
    title: 'De memorizar a [comprender|understand|comprendre|capire|理解する] de verdad.',
    lead: 'Una experiencia pensada para entender lo que lees, no solo repetirlo.',
    comparisons: [
      {
        traditional: 'Palabras sueltas sin relación.',
        dolynation: 'Vocabulario y gramática dentro de textos reales.',
      },
      {
        traditional: 'Tests rígidos de opción múltiple.',
        dolynation: 'Resúmenes propios evaluados al instante por IA.',
      },
      {
        traditional: 'Rachas que reemplazan el aprendizaje.',
        dolynation: 'Progreso que impulsa tu hábito de lectura.',
      },
    ],
  },
  {
    id: 'funcionalidades',
    index: '04',
    navLabel: 'Funcionalidades',
    eyebrow: 'Características y Funcionalidades',
    title: 'Todo para tu [fluidez|fluency|fluidité|fluenza|流暢さ].',
    lead: 'Herramientas simples y potentes para avanzar sin límites.',
    cards: [
      {
        tag: '01 · IA Contextual',
        title: 'Lecturas dinámicas',
        description: 'Textos adaptados a tu nivel con vocabulario útil.',
      },
      {
        tag: '02 · Evaluación IA',
        title: 'Resúmenes inteligentes',
        description: 'Escribe lo que entendiste y recibe retroalimentación real.',
      },
      {
        tag: '03 · Sin Fricción',
        title: 'Elige tu propio nivel',
        description: 'Empieza donde quieras, sin exámenes obligatorios.',
      },
      {
        tag: '04 · Constancia',
        title: 'Rachas con propósito',
        description: 'Métricas claras que celebran tu comprensión diaria.',
      },
    ],
  },
];

/** Palabras que deja Doly como "rastro" en su camino (huellas) */
export const trailWords = [
  'contexto',
  'context',
  'lectura',
  'reading',
  'comprensión',
  'meaning',
  'gramática',
  'grammar',
  'fluidez',
  'fluency',
  'síntesis',
  'summary',
  'idioma',
  'language',
  'progreso',
  'mastery',
];

export const cta = {
  eyebrow: 'Supera el techo de aprendizaje',
  title: 'Empieza tu [camino|path|chemin|cammino|道] en DolyNation.',
  body: 'Elige tu nivel, lee en contexto y comprueba tu comprensión con IA.',
  primary: { label: 'Comenzar ahora', appPath: '/register' },
  secondary: { label: 'Explorar idiomas', appPath: '/register' },
};

export const headerActions = {
  login: { label: 'Iniciar sesión', appPath: '/login' },
  signup: { label: 'Empezar', appPath: '/register' },
};

export const footerLinks = [
  { label: 'Términos', appPath: '/terms' },
  { label: 'Privacidad', appPath: '/privacy' },
  { label: 'Soporte', appPath: '/support' },
];

export const nav = [
  { label: 'El Problema', href: '#story-track', sectionIndex: 1 },
  { label: '¿Qué es?', href: '#story-track', sectionIndex: 2 },
  { label: '¿Por qué elegirnos?', href: '#story-track', sectionIndex: 3 },
  { label: 'Funcionalidades', href: '#story-track', sectionIndex: 4 },
];

export const footer = {
  note: 'DolyNation · Dolynglish — Comprensión lectora, vocabulario y gramática en contexto.',
};
