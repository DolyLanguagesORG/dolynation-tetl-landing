/**
 * Convierte el marcado "[palabra|trad1|trad2]" en segmentos para renderizar
 * palabras clave con anotación de traducción animada.
 */
export type RichSegment =
  | { type: 'text'; value: string }
  | { type: 'xlate'; value: string; translations: string[] };

export function parseRich(input: string): RichSegment[] {
  const out: RichSegment[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ type: 'text', value: input.slice(last, m.index) });
    const [word, ...translations] = m[1].split('|');
    out.push({ type: 'xlate', value: word, translations });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ type: 'text', value: input.slice(last) });
  return out;
}

/** Texto plano (para aria-label / SEO) */
export function plainRich(input: string): string {
  return input.replace(/\[([^\]|]+)[^\]]*\]/g, '$1');
}
