/**
 * ==================================================================
 *  CONTENIDO OFICIAL DE LA LANDING — DolyNation · Tetl / Dolynglish
 * ==================================================================
 *  Basado en el Planteamiento del Problema y la Justificación del proyecto.
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
  eyebrow: 'DolyNation · Aprendizaje contextual de idiomas con IA',
  subtitle:
    'Supera el techo de las apps tradicionales: aprende vocabulario, gramática y comprensión lectora donde realmente cobran sentido — dentro del texto.',
  scrollCue: 'Desliza por cada sección para avanzar con Doly',
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
  /** Waypoint de Doly asociado a esta sección (1..4) */
  waypointStep: number;
  waypointLabel: string;
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
    title: 'Cuando el juego reemplaza al [idioma|language|langue|lingua|言語], aparece el techo de aprendizaje.',
    lead: 'Las plataformas actuales sostienen la motivación con puntos, rachas y recompensas, pero relegan a segundo plano el desarrollo real del vocabulario y la comprensión profunda.',
    waypointStep: 1,
    waypointLabel: 'Paso 01 · Identificando el estancamiento',
    cards: [
      {
        tag: '01 · Gamificación superficial',
        title: 'Dinámicas de juego sobre comprensión',
        description:
          'Funciona en etapas iniciales, pero resulta insuficiente cuando ya tienes conocimientos previos o nivel básico-intermedio.',
      },
      {
        tag: '02 · Palabras aisladas',
        title: 'Vocabulario descontextualizado',
        description:
          'Memorizar una palabra suelta no garantiza usarla bien: su significado cambia según la oración, el contexto y la estructura gramatical.',
      },
      {
        tag: '03 · Contenido efímero',
        title: 'Techo de aprendizaje y estancamiento',
        description:
          'Las lecciones breves y ejercicios repetitivos dejan de representar un reto con el tiempo, frenando tu progreso real.',
      },
    ],
  },
  {
    id: 'que-es',
    index: '02',
    navLabel: '¿Qué es?',
    eyebrow: '¿Qué es DolyNation?',
    title: 'El [texto|text|texte|testo|文章] como unidad central de aprendizaje.',
    lead: 'DolyNation (a través de Dolynglish) es una plataforma complementaria diseñada para integrar comprensión lectora, vocabulario, gramática e interpretación contextual en una sola experiencia.',
    waypointStep: 2,
    waypointLabel: 'Paso 02 · Llegando al libro abierto',
    badge: 'Comprensión Lectora + Vocabulario + Gramática + IA',
    cards: [
      {
        tag: 'Unidad Central',
        title: 'Aprender leyendo en contexto real',
        description:
          'En lugar de fragmentos desconectados, cada sesión gira alrededor de textos completos generados por IA donde las palabras y reglas gramaticales interactúan de forma natural.',
      },
      {
        tag: 'Para quién es',
        title: 'Rompe la barrera del nivel básico-intermedio',
        description:
          'Pensada para estudiantes que ya practicaron en apps tradicionales pero sienten que memorizar reglas sueltas no les permite desenvolverse en situaciones reales.',
      },
    ],
  },
  {
    id: 'por-que',
    index: '03',
    navLabel: '¿Por qué DolyNation?',
    eyebrow: '¿Por qué elegir DolyNation?',
    title: 'De memorizar palabras sueltas a [comprender|understand|comprendre|capire|理解する] de verdad.',
    lead: 'Mientras Doly descansa sobre el libro abierto, comparamos por qué centrar el estudio en la lectura contextual transforma tu dominio del idioma frente a los métodos tradicionales.',
    waypointStep: 3,
    waypointLabel: 'Paso 03 · Pausa de lectura sobre el libro',
    comparisons: [
      {
        traditional: 'Ejercicios aislados que memorizan palabras sin contexto de uso.',
        dolynation: 'Textos vivos donde cada palabra se aprende dentro de su oración y estructura gramatical.',
      },
      {
        traditional: 'Exámenes de diagnóstico rígidos y preguntas cerradas de opción múltiple.',
        dolynation: 'Selección manual de nivel y evaluación mediante resúmenes redactados por ti y calificados por IA.',
      },
      {
        traditional: 'Rachas y puntos que desplazan al contenido educativo.',
        dolynation: 'Puntuación, progreso y rachas que acompañan tu motivación sin quitarle el centro a la lectura.',
      },
    ],
  },
  {
    id: 'funcionalidades',
    index: '04',
    navLabel: 'Funcionalidades',
    eyebrow: 'Características y Funcionalidades',
    title: 'Herramientas diseñadas para un [dominio|mastery|maîtrise|padronanza|習得] profundo.',
    lead: 'Cada funcionalidad de DolyNation responde directamente a las limitaciones de las aplicaciones convencionales para que avances sin techo de aprendizaje.',
    waypointStep: 4,
    waypointLabel: 'Paso 04 · Avanzando con nuevas habilidades',
    cards: [
      {
        tag: 'IA Contextual',
        title: 'Lecturas generadas por IA',
        description:
          'Accede a textos dinámicos que vinculan vocabulario y gramática en su contexto real de uso según el nivel que elijas.',
      },
      {
        tag: 'Evaluación Real',
        title: 'Resúmenes calificados por IA',
        description:
          'Demuestra tu comprensión redactando tu propio resumen del texto; la IA evalúa tu interpretación real en vez de usar preguntas predecibles.',
      },
      {
        tag: 'Sin Fricción',
        title: 'Elección manual de nivel',
        description:
          'Tú decides en qué nivel practicar desde el primer día, sin exámenes de diagnóstico obligatorios que limiten tu acceso.',
      },
      {
        tag: 'Motivación Equilibrada',
        title: 'Puntos, progreso y rachas con propósito',
        description:
          'Mantén el hábito diario con métricas claras de avance y rachas de estudio donde el aprendizaje real sigue siendo el protagonista.',
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
  body: 'Elige tu nivel sin exámenes de diagnóstico, lee en contexto real y comprueba tu comprensión con inteligencia artificial.',
  primary: { label: 'Comenzar ahora', href: '#problema' },
  secondary: { label: 'Explorar funcionalidades', href: '#funcionalidades' },
};

export const nav = [
  { label: 'El Problema', href: '#sec-problema', sectionIndex: 1 },
  { label: '¿Qué es?', href: '#sec-que-es', sectionIndex: 2 },
  { label: '¿Por qué elegirnos?', href: '#sec-por-que', sectionIndex: 3 },
  { label: 'Funcionalidades', href: '#sec-funcionalidades', sectionIndex: 4 },
];

export const footer = {
  note: 'DolyNation · Dolynglish — Comprensión lectora, vocabulario y gramática en contexto.',
};
