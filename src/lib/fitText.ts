/**
 * Dimensione del carattere che fa stare un testo su una riga di larghezza
 * data, riempiendola.
 *
 * Serve al nome del gruppo sulla sua scheda: un nome corto deve venire
 * grande, uno lungo più piccolo, e in entrambi i casi occupare bene la
 * scheda. `adjustsFontSizeToFit` di React Native sa solo *ridurre* (mai
 * ingrandire) e sul web non esiste; qui invece il calcolo è lo stesso
 * dappertutto.
 *
 * Le larghezze sono quelle vere delle lettere di Nunito ExtraBold, lette
 * dal file del carattere e espresse in "em" (1 = la dimensione del
 * carattere). Valgono solo per quel carattere: vedi FONT_ROUNDED.
 */

// prettier-ignore
const EM: Record<string, number> = {
  a: 0.557, b: 0.61, c: 0.478, d: 0.61, e: 0.549, f: 0.382, g: 0.615, h: 0.595, i: 0.268,
  j: 0.273, k: 0.558, l: 0.333, m: 0.889, n: 0.595, o: 0.589, p: 0.61, q: 0.61, r: 0.412,
  s: 0.492, t: 0.404, u: 0.59, v: 0.534, w: 0.861, x: 0.559, y: 0.533, z: 0.48,
  A: 0.753, B: 0.695, C: 0.684, D: 0.774, E: 0.605, F: 0.57, G: 0.742, H: 0.78, I: 0.297,
  J: 0.372, K: 0.688, L: 0.573, M: 0.876, N: 0.753, O: 0.796, P: 0.664, Q: 0.796, R: 0.696,
  S: 0.641, T: 0.632, U: 0.743, V: 0.727, W: 1.12, X: 0.685, Y: 0.631, Z: 0.615,
  ' ': 0.279, '.': 0.26, ',': 0.26, '-': 0.44, "'": 0.256, '!': 0.26, '?': 0.468, '&': 0.745,
  '(': 0.382, ')': 0.382,
};
/** Cifre e caratteri non in tabella: una larghezza media, un po'
 * abbondante così da sbagliare verso il piccolo e mai uscire dalla riga. */
const EM_DEFAULT = 0.62;
/** Emoji e simboli: più larghi di una lettera. */
const EM_EMOJI = 1.15;

/** Spaziatura fra le lettere, in em: leggermente stretta, come si fa coi
 * titoli grandi. Va applicata come `letterSpacing: fontSize * LETTER_SPACING_EM`. */
export const LETTER_SPACING_EM = -0.012;

function emOf(ch: string): number {
  const known = EM[ch];
  if (known !== undefined) return known;
  // Lettere accentate: stessa larghezza della lettera base.
  const base = ch.normalize('NFD').charAt(0);
  if (base !== ch && EM[base] !== undefined) return EM[base];
  if (ch.codePointAt(0)! > 0x2000) return EM_EMOJI;
  return EM_DEFAULT;
}

/** Larghezza del testo in em, spaziatura fra lettere compresa. */
export function textWidthEm(text: string): number {
  const chars = Array.from(text);
  const letters = chars.reduce((sum, ch) => sum + emOf(ch), 0);
  return letters + LETTER_SPACING_EM * chars.length;
}

/**
 * La dimensione più grande, fra `min` e `max`, a cui `text` sta in
 * `width` punti. Sotto `min` non si scende: da lì in poi un nome lunghissimo
 * viene troncato coi puntini, meglio che diventare illeggibile.
 */
export function fitFontSize(text: string, width: number, min: number, max: number): number {
  const em = textWidthEm(text.trim());
  if (width <= 0 || em <= 0) return max;
  // 3% di margine: le misure sono esatte ma l'arrotondamento dei punti
  // sullo schermo no, e un pixel di troppo manderebbe a capo o troncherebbe.
  const size = (width * 0.97) / em;
  return Math.max(min, Math.min(max, Math.floor(size)));
}
