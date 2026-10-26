// Il riquadro in cui cercare il luogo Google giusto, e l'indirizzo della
// sua scheda.
//
// Sta in un file a parte, senza API di Deno, per poterlo collaudare da
// solo (stesso schema di link-preview/parse.ts).

/** Mezzo lato del riquadro attorno al punto salvato. Fuori da qui un
 * risultato non è "quel" posto ma un omonimo: meglio non collegare niente
 * che collegare il Colosseo di un'altra città. È largo abbastanza da
 * coprire un tocco impreciso e i luoghi grandi (un parco, una piazza),
 * dove il punto di Google sta al centro e il nostro magari sul bordo. */
export const MAX_DISTANCE_M = 400;

const M_PER_DEG_LAT = 111320;

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Il riquadro di `halfSide` metri per lato attorno al punto, nel formato
 * di `locationRestriction.rectangle` di Google Places. Un riquadro e non un
 * cerchio perché Google accetta solo quello come recinto: negli angoli si
 * arriva a circa 1,4 volte `halfSide`.
 *
 * A cavallo del meridiano 180 l'ovest resta maggiore dell'est, che per
 * Google vuol dire proprio "attraversa il meridiano".
 */
export function boxAround(lat: number, lng: number, halfSide = MAX_DISTANCE_M): { low: LatLng; high: LatLng } {
  const dLat = halfSide / M_PER_DEG_LAT;
  // Verso i poli un grado di longitudine si accorcia: servono più gradi.
  const dLng = halfSide / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  const fullLng = !(dLng < 180);
  return {
    low: { latitude: Math.max(-90, lat - dLat), longitude: fullLng ? -180 : wrap(lng - dLng) },
    high: { latitude: Math.min(90, lat + dLat), longitude: fullLng ? 180 : wrap(lng + dLng) },
  };
}

/** Indirizzo della scheda di un luogo — identico a `googleMapsPlaceUrl`
 * nell'app, così un posto collegato qui è indistinguibile da uno salvato
 * toccando l'icona sulla mappa. */
export function placeUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}
