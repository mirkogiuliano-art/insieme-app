// Insieme — Edge Function che trova il luogo Google corrispondente a un
// posto salvato.
//
// Chiamata dal client:
//   supabase.functions.invoke('resolve-place', { body: { pinId } })
//
// Il problema. Google apre la scheda di un'attrazione (orari, recensioni,
// foto) solo se ne conosce l'identificativo. L'app lo riceve quando si
// salva un posto toccando l'icona di un luogo sulla mappa; se invece si
// tocca un punto qualsiasi e si scrive il nome, ha in mano solo una parola,
// e con una parola Google può fare soltanto una ricerca.
//
// Qui si chiede a Google Places «c'è un luogo che si chiama così, in questo
// punto?». Se c'è, l'indirizzo della sua scheda viene scritto nel posto
// (`pins.maps_url`), una volta per tutte e per tutti i membri del gruppo:
// la modifica arriva agli altri col normale aggiornamento in tempo reale.
//
// Perché sul server:
//  - la chiave di Google Places resta segreta (è un segreto della
//    funzione, GOOGLE_PLACES_API_KEY), e non è quella delle mappe
//    dell'app, che è legata al pacchetto Android;
//  - `pins` non ha una regola di modifica per i client, di proposito: qui
//    si scrive solo quel campo e solo se è ancora vuoto, con la chiave di
//    servizio, dopo aver controllato che chi chiama sia nel gruppo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pickCandidate, placeUrl, type Candidate } from './pick.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FETCH_TIMEOUT_MS = 6000;
/** Raggio entro cui Google privilegia i risultati. È solo una preferenza:
 * il taglio vero degli omonimi lontani lo fa `pickCandidate`. */
const BIAS_RADIUS_M = 500;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function searchPlaces(key: string, name: string, lat: number, lng: number): Promise<Candidate[]> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      // Si chiedono solo i campi che servono: Google fa pagare per
      // gruppi di campi, e id/nome/posizione stanno nella fascia base.
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: name,
      languageCode: 'it',
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: BIAS_RADIUS_M } },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Il testo dell'errore di Google dice il perché (chiave non valida,
    // API non attivata, fatturazione assente): finisce nei log della
    // funzione, che è dove lo si va a cercare.
    console.error('Places', res.status, await res.text());
    throw new Error(`Places ${res.status}`);
  }
  const data = (await res.json()) as {
    places?: { id: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number } }[];
  };
  return (data.places ?? [])
    .filter((p) => p.id && p.location)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? '',
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
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
  const userId = auth?.user?.id;
  if (!userId) return reply({ error: 'Non autenticato.' }, 401);

  let pinId: unknown;
  try {
    ({ pinId } = await req.json());
  } catch {
    // corpo mancante o non JSON: lo gestisce il controllo sotto
  }
  if (typeof pinId !== 'string' || !pinId) return reply({ error: 'pinId mancante.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: pin } = await admin
    .from('pins')
    .select('id, group_id, name, lat, lng, maps_url')
    .eq('id', pinId)
    .maybeSingle();
  // Posto inesistente e posto di un gruppo altrui danno la stessa
  // risposta: non si rivela a un estraneo che quel posto esiste.
  if (!pin) return reply({ error: 'Posto non trovato.' }, 404);
  const { count } = await admin
    .from('group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', pin.group_id)
    .eq('user_id', userId);
  if (!count) return reply({ error: 'Posto non trovato.' }, 404);

  // Già collegato (da un altro membro un attimo prima, o salvato
  // toccando l'icona): niente da cercare.
  if (pin.maps_url) return reply({ mapsUrl: pin.maps_url });

  let candidates: Candidate[];
  try {
    candidates = await searchPlaces(key, pin.name, pin.lat, pin.lng);
  } catch {
    return reply({ error: 'Ricerca su Google non riuscita.' }, 502);
  }

  const found = pickCandidate(candidates, pin.lat, pin.lng);
  if (!found) return reply({ mapsUrl: null });

  const mapsUrl = placeUrl(pin.name, found.id);
  // `is null` nella condizione: se nel frattempo qualcuno ha già scritto
  // il campo, vince il suo valore e questo aggiornamento non fa niente.
  await admin.from('pins').update({ maps_url: mapsUrl }).eq('id', pin.id).is('maps_url', null);
  return reply({ mapsUrl, googleName: found.name });
});
