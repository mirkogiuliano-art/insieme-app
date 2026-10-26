// Insieme — Edge Function che cerca un luogo per nome, per aggiungerlo
// alla mappa del gruppo.
//
// Chiamata dal client, in due tempi:
//   1. mentre si scrive:
//      supabase.functions.invoke('search-places', { body: { query, session, lat?, lng? } })
//      → al più cinque suggerimenti Google: identificativo, nome, indirizzo
//        e, con la posizione di chi cerca, la distanza;
//   2. quando se ne sceglie uno:
//      supabase.functions.invoke('search-places', { body: { placeId, session } })
//      → la sua posizione.
//
// Perché in due tempi. I suggerimenti vengono dall'Autocomplete di Google,
// che costa molto meno della ricerca testuale; la posizione si chiede una
// volta sola, per il luogo scelto. `session` lega le due chiamate: Google
// le conta come una ricerca sola e fa pagare poco o niente i suggerimenti.
//
// L'identificativo è ciò che fa aprire a "Portami lì" la scheda vera
// dell'attrazione (vedi resolve-place): un posto aggiunto da qui ce l'ha
// fin da subito.
//
// Sta sul server per la stessa ragione di resolve-place: la chiave di
// Google Places (segreto GOOGLE_PLACES_API_KEY) non deve finire nell'app.
// Risponde solo a chi ha fatto l'accesso, così la chiave non diventa un
// servizio di ricerca gratuito per chiunque trovi l'indirizzo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const FETCH_TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;
/** Con la posizione di chi cerca, Google privilegia i luoghi vicini: "ramen"
 * a Tokyo trova i ramen di Tokyo. È una preferenza, non un recinto. */
const BIAS_RADIUS_M = 30000;
/** Il formato che Google accetta per il gettone di sessione. */
const SESSION_RE = /^[A-Za-z0-9_-]{1,36}$/;
/** L'identificativo finisce nell'indirizzo della richiesta: niente barre. */
const PLACE_ID_RE = /^[A-Za-z0-9_-]{1,300}$/;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return reply({ error: 'GOOGLE_PLACES_API_KEY non configurata.' }, 503);

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth?.user?.id) return reply({ error: 'Non autenticato.' }, 401);
  // I nomi arrivano nella lingua dell'app di chi cerca, che l'app tiene
  // nei dati dell'utente (la stessa che leggono le email).
  const lang = auth.user.user_metadata?.lang;
  const languageCode = typeof lang === 'string' ? lang : 'en';

  let body: { query?: unknown; placeId?: unknown; session?: unknown; lat?: unknown; lng?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corpo mancante: lo gestiscono i controlli sotto
  }
  // Senza un gettone valido si cerca lo stesso: Google fa pagare ogni
  // richiesta a sé, ma chi cerca non se ne accorge.
  const session = typeof body.session === 'string' && SESSION_RE.test(body.session) ? body.session : undefined;

  if (typeof body.placeId === 'string') {
    if (!PLACE_ID_RE.test(body.placeId)) return reply({ error: 'placeId non valido.' }, 400);
    const params = new URLSearchParams({ languageCode, ...(session ? { sessionToken: session } : {}) });
    const res = await fetch(`${DETAILS_URL}${body.placeId}?${params}`, {
      headers: {
        'X-Goog-Api-Key': key,
        // Solo la posizione: sta nella fascia più economica dei dettagli.
        'X-Goog-FieldMask': 'location',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!res || !res.ok) {
      if (res) console.error('Places', res.status, await res.text());
      return reply({ error: 'Ricerca su Google non riuscita.' }, 502);
    }
    const data = (await res.json()) as { location?: { latitude: number; longitude: number } };
    if (!data.location) return reply({ error: 'Posizione non trovata.' }, 502);
    return reply({ lat: data.location.latitude, lng: data.location.longitude });
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 120) : '';
  if (query.length < 2) return reply({ results: [] });
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  const center = lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null;

  const res = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: query,
      languageCode,
      sessionToken: session,
      // `origin` fa tornare la distanza di ogni suggerimento da chi cerca.
      ...(center ? { locationBias: { circle: { center, radius: BIAS_RADIUS_M } }, origin: center } : {}),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);

  if (!res || !res.ok) {
    if (res) console.error('Places', res.status, await res.text());
    return reply({ error: 'Ricerca su Google non riuscita.' }, 502);
  }

  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        distanceMeters?: number;
      };
    }[];
  };

  const results = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p) => p?.placeId && p.structuredFormat?.mainText?.text)
    .slice(0, MAX_RESULTS)
    .map((p) => ({
      placeId: p!.placeId!,
      name: p!.structuredFormat!.mainText!.text!,
      address: p!.structuredFormat!.secondaryText?.text ?? '',
      ...(typeof p!.distanceMeters === 'number' ? { distanceM: p!.distanceMeters } : {}),
    }));
  return reply({ results });
});
