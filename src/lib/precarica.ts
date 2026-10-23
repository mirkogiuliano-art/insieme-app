/**
 * Le copie di un gruppo sul telefono, e chi le scrive prima che servano.
 *
 * Link, posti e categorie li legge la chat: aprendo arrivano con
 * apriGruppo, e si rileggono aprendo il «+» o il menu di un messaggio.
 * Dalla home, in sottofondo, si scaricano i gruppi non ancora aperti su
 * questo telefono o con novità (precaricaGruppi): aprendoli c'è già tutto.
 *
 * Alla chat servono per le schede dei posti mandati e per il «+», e sono
 * gli stessi che leggono le sezioni Link e Mappa: qui se ne salva anche la
 * loro copia. Aprendo una sezione per la prima volta i dati ci sono già,
 * invece di una pagina che dice «nessun link» e si riempie dopo qualche
 * secondo. La sezione poi li rilegge comunque dal server.
 */

import { listCategories as listLinkCategories } from '@/lib/api/linkCategories';
import { listLinks } from '@/lib/api/links';
import { listPins } from '@/lib/api/pins';
import { listCategories as listPlaceCategories } from '@/lib/api/placeCategories';
import { listPlaceLinks } from '@/lib/api/placeLinks';
import { leggiCopia, salvaCopia } from '@/lib/copiaLocale';
import { supabase } from '@/lib/supabase';
import { apriGruppo, type Gruppo } from '@/lib/api/apriGruppo';
import type { GroupPreview } from '@/lib/api/groupPreviews';
import type { RawMessage } from '@/lib/api/messages';
import type { RawReaction } from '@/lib/api/reactions';
import type { RawPoll, RawVote } from '@/lib/api/polls';
import type { Group } from '@/types';

/** La copia della chat. */
export type CopiaChat = {
  msgs: RawMessage[];
  reacts: RawReaction[];
  sondaggi: RawPoll[];
  voti: RawVote[];
  /** Chi ho bloccato: senza, mostrando la copia i suoi messaggi
   * comparirebbero finché non risponde il server. Manca nelle copie
   * salvate prima che ci fosse. */
  bloccati?: string[];
};

/** Posti e link della chat: le schede dei posti mandati e il «+». */
export type CopiaChatExtra = {
  p: Awaited<ReturnType<typeof listPins>>;
  pc: Awaited<ReturnType<typeof listPlaceCategories>>;
  l: Awaited<ReturnType<typeof listLinks>>;
  lc: Awaited<ReturnType<typeof listLinkCategories>>;
};

/** La copia della sezione Link. */
export type CopiaLink = {
  cats: Awaited<ReturnType<typeof listLinkCategories>>;
  links: Awaited<ReturnType<typeof listLinks>>;
  pinList: Awaited<ReturnType<typeof listPins>>;
  placeCats: Awaited<ReturnType<typeof listPlaceCategories>>;
  pl: Awaited<ReturnType<typeof listPlaceLinks>>;
};

/** La copia della sezione Mappa. */
export type CopiaMappa = {
  cats: Awaited<ReturnType<typeof listPlaceCategories>>;
  pinList: Awaited<ReturnType<typeof listPins>>;
  linkList: Awaited<ReturnType<typeof listLinks>>;
  pl: Awaited<ReturnType<typeof listPlaceLinks>>;
};

export type LinkEPosti = {
  linkCats: Awaited<ReturnType<typeof listLinkCategories>>;
  links: Awaited<ReturnType<typeof listLinks>>;
  pins: Awaited<ReturnType<typeof listPins>>;
  placeCats: Awaited<ReturnType<typeof listPlaceCategories>>;
  placeLinks: Awaited<ReturnType<typeof listPlaceLinks>>;
};

export function salvaCopieLinkEMappa(utente: string | undefined, groupId: string, d: LinkEPosti): void {
  salvaCopia<CopiaLink>(utente, `link:${groupId}`, { cats: d.linkCats, links: d.links, pinList: d.pins, placeCats: d.placeCats, pl: d.placeLinks });
  salvaCopia<CopiaMappa>(utente, `mappa:${groupId}`, { cats: d.placeCats, pinList: d.pins, linkList: d.links, pl: d.placeLinks });
}

/** Tutte le copie di un gruppo, come se lo si fosse appena aperto: la
 * chat, Link e Mappa, i nomi, le cose da sapere e, se c'è, la meta. Le
 * cose da sapere si salvano già qui e non solo aprendo Info: in viaggio,
 * senza rete, sono quelle che si cercano. */
export function salvaCopieGruppo(utente: string | undefined, groupId: string, g: Gruppo, metaId?: string | null): void {
  salvaCopia<CopiaChat>(utente, `chat:${groupId}`, {
    msgs: g.messaggi,
    reacts: g.reazioni,
    sondaggi: g.sondaggi,
    voti: g.voti,
    bloccati: g.bloccati,
  });
  salvaCopia<CopiaChatExtra>(utente, `chat-extra:${groupId}`, { p: g.posti, pc: g.categoriePosti, l: g.link, lc: g.categorieLink });
  salvaCopieLinkEMappa(utente, groupId, {
    linkCats: g.categorieLink,
    links: g.link,
    pins: g.posti,
    placeCats: g.categoriePosti,
    placeLinks: g.collegamenti,
  });
  salvaCopia(utente, `membri:${groupId}`, g.nomi);
  salvaCopia(utente, `info:${groupId}`, g.info);
  if (metaId) salvaCopia(utente, `meta:${groupId}`, g.posti.find((p) => p.id === metaId)?.name ?? null);
}

let precaricando = false;

/** Scarica in sottofondo i gruppi che su questo telefono non hanno ancora
 * una copia, o che hanno novità dopo l'ultima: aprendoli, la chat è già
 * tutta qui. Uno alla volta, per non passare davanti a quello che si
 * tocca: Android manda al server cinque richieste alla volta. */
export async function precaricaGruppi(
  utente: string | undefined,
  gruppi: Group[],
  anteprime: Record<string, GroupPreview>,
): Promise<void> {
  if (!utente || precaricando) return;
  precaricando = true;
  try {
    for (const gruppo of gruppi) {
      const copia = await leggiCopia<CopiaChat>(utente, `chat:${gruppo.id}`);
      const ultima = anteprime[gruppo.id]?.lastAt ?? 0;
      if (copia && copia.ts >= ultima) continue;
      const g = await apriGruppo(gruppo.id);
      // Uscito dall'account mentre scaricava: le copie sono già state
      // cancellate, e questa resterebbe sul telefono.
      if ((await supabase.auth.getSession()).data.session?.user.id !== utente) return;
      salvaCopieGruppo(utente, gruppo.id, g, gruppo.placePinId);
    }
  } catch {
    // Senza rete si riprova al prossimo ritorno sulla home.
  } finally {
    precaricando = false;
  }
}

export async function leggiLinkEPosti(utente: string | undefined, groupId: string): Promise<LinkEPosti> {
  const [linkCats, links, pins, placeCats, placeLinks] = await Promise.all([
    listLinkCategories(groupId),
    listLinks(groupId),
    listPins(groupId),
    listPlaceCategories(groupId),
    listPlaceLinks(groupId),
  ]);
  const d = { linkCats, links, pins, placeCats, placeLinks };
  salvaCopieLinkEMappa(utente, groupId, d);
  return d;
}
