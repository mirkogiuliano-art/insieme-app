// Scelta del luogo Google giusto fra i risultati di una ricerca.
//
// Sta in un file a parte, senza API di Deno, per poterla collaudare da
// sola (stesso schema di link-preview/parse.ts).

export interface Candidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Oltre questa distanza dal punto salvato un risultato non è "quel"
 * posto ma un omonimo: meglio non collegare niente che collegare il
 * Colosseo di un'altra città. È largo abbastanza da coprire un tocco
 * impreciso e i luoghi grandi (un parco, una piazza), dove il punto di
 * Google sta al centro e il nostro magari sul bordo. */
export const MAX_DISTANCE_M = 400;

/** Distanza in metri fra due punti (formula dell'emisenoverso). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Il primo risultato abbastanza vicino al punto salvato.
 *
 * Si rispetta l'ordine di Google, che è per pertinenza col nome: cercando
 * "Colosseo" il primo è il monumento anche se una fermata della metro
 * "Colosseo" sta più vicina al nostro spillo. La distanza serve solo a
 * scartare gli omonimi lontani, non a decidere fra quelli vicini.
 */
export function pickCandidate(
  candidates: Candidate[],
  lat: number,
  lng: number,
  maxDistance = MAX_DISTANCE_M,
): Candidate | null {
  for (const c of candidates) {
    if (distanceM(lat, lng, c.lat, c.lng) <= maxDistance) return c;
  }
  return null;
}

/** Indirizzo della scheda di un luogo — identico a `googleMapsPlaceUrl`
 * nell'app, così un posto collegato qui è indistinguibile da uno salvato
 * toccando l'icona sulla mappa. */
export function placeUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}
