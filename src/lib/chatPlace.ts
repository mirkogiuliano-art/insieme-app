/**
 * I messaggi che portano un posto.
 *
 * "Manda in chat" dal menu di un posto, e "Un posto" / "Dove sono" dal +
 * della chat, scrivono un messaggio di testo fatto così:
 *
 *     (una riga di chi lo manda, facoltativa)
 *     📍 Nome del posto
 *     https://www.google.com/maps/…
 *
 * Resta testo semplice di proposito: chi ha una versione vecchia dell'app
 * lo legge comunque, e le notifiche lo mostrano per quello che è. Questa
 * funzione lo riconosce, così la chat può disegnarlo come la scheda del
 * posto invece che come un indirizzo lungo.
 */
export interface PlaceMessage {
  /** La riga scritta da chi l'ha mandato, se c'è. */
  note: string;
  name: string;
  url: string;
}

const PIN = '📍';

export function parsePlaceMessage(text: string | null | undefined): PlaceMessage | null {
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim());
  const i = lines.findIndex((l) => l.startsWith(PIN));
  if (i < 0 || i + 1 >= lines.length) return null;
  const url = lines[i + 1];
  if (!/^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) return null;
  // Dopo l'indirizzo non deve esserci altro: un messaggio qualunque che
  // contiene per caso una puntina non è un posto.
  if (lines.slice(i + 2).some(Boolean)) return null;
  const name = lines[i].slice(PIN.length).trim();
  if (!name) return null;
  return { note: lines.slice(0, i).join('\n').trim(), name, url };
}

/** Il testo del messaggio per un posto: l'inverso di `parsePlaceMessage`. */
export function placeMessageText(name: string, url: string, note = ''): string {
  return [note.trim(), `${PIN} ${name}`, url].filter(Boolean).join('\n');
}
