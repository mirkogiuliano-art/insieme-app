// Insieme — Edge Function che cerca un luogo per nome, per aggiungerlo
// alla mappa del gruppo.
//
// Chiamata dal client:
//   supabase.functions.invoke('search-places', { body: { query, lat?, lng? } })
//
// Risponde con al più cinque luoghi Google: nome, indirizzo, posizione e
// identificativo. L'identificativo è ciò che fa aprire a "Portami lì" la
// scheda vera dell'attrazione (vedi resolve-place): un posto aggiunto da
// qui ce l'ha fin da subito.
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

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FETCH_TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;
/** Con la posizione di chi cerca, Google privilegia i luoghi vicini: "ramen"
 * a Tokyo trova i ramen di Tokyo. È una preferenza, non un recinto. */
const BIAS_RADIUS_M = 30000;

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

  let body: { query?: unknown; lat?: unknown; lng?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corpo mancante: lo gestisce il controllo sotto
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 120) : '';
  if (query.length < 2) return reply({ results: [] });
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      // Solo i campi che servono: id, nome, indirizzo e posizione.
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'it',
      maxResultCount: MAX_RESULTS,
      ...(lat !== null && lng !== null
        ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: BIAS_RADIUS_M } } }
        : {}),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);

  if (!res || !res.ok) {
    if (res) console.error('Places', res.status, await res.text());
    return reply({ error: 'Ricerca su Google non riuscita.' }, 502);
  }

  const data = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };

  const results = (data.places ?? [])
    .filter((p) => p.id && p.location && p.displayName?.text)
    .map((p) => ({
      placeId: p.id,
      name: p.displayName!.text!,
      address: p.formattedAddress ?? '',
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
  return reply({ results });
});
