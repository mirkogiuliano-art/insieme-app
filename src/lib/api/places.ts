import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { mapsUrlForPlace } from '@/lib/utils';
import type { RawPin } from '@/lib/api/pins';

/** Oltre questo tempo si apre Maps con quello che si ha: chi ha toccato
 * "Portami lì" non deve restare ad aspettare Google. */
const RESOLVE_TIMEOUT_MS = 5000;

/**
 * Chiede al server di collegare il posto al suo luogo Google (vedi
 * supabase/functions/resolve-place). Restituisce l'indirizzo della scheda
 * del luogo, oppure `null` se Google non ha niente con quel nome in quel
 * punto — o se la ricerca non è andata a buon fine: in ogni caso chi
 * chiama ripiega sulla ricerca per nome, come prima.
 *
 * Il server scrive anche il risultato nel posto, per tutti: gli altri
 * membri lo ricevono con l'aggiornamento in tempo reale.
 */
export async function linkPinToGooglePlace(pinId: string): Promise<string | null> {
  try {
    const call = supabase.functions.invoke('resolve-place', { body: { pinId } });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS));
    const res = await Promise.race([call, timeout]);
    if (!res || res.error || !res.data) return null;
    return (res.data as { mapsUrl?: string | null }).mapsUrl ?? null;
  } catch {
    return null;
  }
}

/** Posti per cui una ricerca è già in corso: un doppio tocco sul
 * pulsante non deve aprire Maps due volte. */
const opening = new Set<string>();

/**
 * Apre il posto su Google Maps, sulla scheda del luogo quando esiste.
 *
 * Se il posto è stato salvato senza toccare l'icona del luogo, la scheda
 * non la conosciamo ancora: la si cerca adesso, una volta sola (poi resta
 * salvata). Se Google non la trova, si ripiega sulla ricerca per nome.
 */
export async function openPinInMaps(pin: RawPin): Promise<void> {
  if (pin.mapsUrl) {
    await Linking.openURL(pin.mapsUrl);
    return;
  }
  if (opening.has(pin.id)) return;
  opening.add(pin.id);
  try {
    const url = (await linkPinToGooglePlace(pin.id)) ?? mapsUrlForPlace(pin);
    await Linking.openURL(url);
  } finally {
    opening.delete(pin.id);
  }
}
