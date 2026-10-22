/**
 * Tutto quello che serve per aprire un gruppo, in una richiesta sola: la
 * funzione `apri_gruppo` del database
 * (supabase/migrations/20261021120000_apri_gruppo.sql).
 *
 * Prima la chat ne faceva una quindicina, e Android le manda al server
 * cinque alla volta: su una rete da telefono la prima apertura arrivava a
 * cinque secondi. Le regole su chi vede cosa sono le stesse delle letture
 * separate, che restano per tutto il resto (ricaricare, scorrere indietro,
 * le altre sezioni).
 */

import { supabase } from '@/lib/supabase';
import { dizionario } from '@/i18n';
import { toRaw as messaggioDaRiga, type RawMessage } from '@/lib/api/messages';
import { toRaw as reazioneDaRiga, type RawReaction } from '@/lib/api/reactions';
import { toRaw as sondaggioDaRiga, type RawPoll, type RawVote } from '@/lib/api/polls';
import { toRaw as postoDaRiga, type RawPin } from '@/lib/api/pins';
import { toRaw as categoriaPostoDaRiga, type RawPlaceCategory } from '@/lib/api/placeCategories';
import { toRaw as linkDaRiga, type RawLink } from '@/lib/api/links';
import { toRaw as categoriaLinkDaRiga, type RawLinkCategory } from '@/lib/api/linkCategories';
import { toRaw as collegamentoDaRiga, type RawPlaceLink } from '@/lib/api/placeLinks';
import { toRaw as infoDaRiga, type RawFact } from '@/lib/api/groupFacts';

/** Quanti messaggi arrivano aprendo: gli altri si caricano scorrendo. */
const PRIMA_PAGINA = 150;

export interface Gruppo {
  messaggi: RawMessage[];
  /** Ci sono messaggi più vecchi, da caricare scorrendo all'indietro. */
  altriMessaggi: boolean;
  reazioni: RawReaction[];
  sondaggi: RawPoll[];
  voti: RawVote[];
  /** userId → nome da mostrare, come listRoster. */
  nomi: Record<string, string>;
  /** userId → ultima volta che ha aperto la chat, come listLastReads. */
  lettoAlle: Record<string, number | null>;
  /** Chi ho bloccato: i suoi messaggi non compaiono. */
  bloccati: string[];
  posti: RawPin[];
  categoriePosti: RawPlaceCategory[];
  link: RawLink[];
  categorieLink: RawLinkCategory[];
  collegamenti: RawPlaceLink[];
  info: RawFact[];
}

const inCorso = new Map<string, Promise<Gruppo>>();

/** La chiedono insieme la chat e lo schermo del gruppo, aprendolo: la
 * richiesta parte una volta sola e la risposta arriva a tutti e due. */
export function apriGruppo(groupId: string): Promise<Gruppo> {
  const giaPartita = inCorso.get(groupId);
  if (giaPartita) return giaPartita;
  const richiesta = leggiGruppo(groupId).finally(() => inCorso.delete(groupId));
  inCorso.set(groupId, richiesta);
  return richiesta;
}

function righe<T>(dati: unknown[] | undefined, daRiga: (riga: never) => T): T[] {
  return (dati ?? []).map((riga) => daRiga(riga as never));
}

async function leggiGruppo(groupId: string): Promise<Gruppo> {
  const { data, error } = await supabase.rpc('apri_gruppo', { p_group_id: groupId, p_limite: PRIMA_PAGINA });
  // Un errore si solleva invece di passare per «gruppo vuoto»: chi
  // chiama mostra la copia salvata sul telefono.
  if (error) throw error;
  const g = (data ?? {}) as Record<string, unknown[] | undefined>;

  const nomi: Record<string, string> = {};
  const lettoAlle: Record<string, number | null> = {};
  for (const m of (g.membri ?? []) as { user_id: string; last_read_at: string | null }[]) {
    nomi[m.user_id] = dizionario().segnaposto.utente;
    lettoAlle[m.user_id] = m.last_read_at ? new Date(m.last_read_at).getTime() : null;
  }
  for (const p of (g.nomi ?? []) as { id: string; display_name: string | null }[]) {
    if (p.display_name && p.id in nomi) nomi[p.id] = p.display_name;
  }

  const messaggi = righe(g.messaggi, messaggioDaRiga);
  return {
    messaggi,
    altriMessaggi: messaggi.length === PRIMA_PAGINA,
    reazioni: righe(g.reazioni, reazioneDaRiga),
    sondaggi: righe(g.sondaggi, sondaggioDaRiga),
    voti: ((g.voti ?? []) as { poll_id: string; user_id: string; option_index: number }[]).map((v) => ({
      pollId: v.poll_id,
      userId: v.user_id,
      optionIndex: v.option_index,
    })),
    nomi,
    lettoAlle,
    bloccati: (g.bloccati ?? []) as string[],
    posti: righe(g.posti, postoDaRiga),
    categoriePosti: righe(g.categorie_posti, categoriaPostoDaRiga),
    link: righe(g.link, linkDaRiga),
    categorieLink: righe(g.categorie_link, categoriaLinkDaRiga),
    collegamenti: righe(g.collegamenti, collegamentoDaRiga),
    info: righe(g.info, infoDaRiga),
  };
}
