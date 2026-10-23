/**
 * I link dell'accesso che tornano all'app dalla posta — oggi quello della
 * nuova password.
 *
 * Li ascolta un punto sempre acceso (`LinkAccessoRouter` in app/_layout),
 * non la schermata che li usa. Il motivo: se l'app era già aperta in
 * sottofondo, il link arriva come evento, e l'evento parte prima che la
 * schermata esista — lei, cercandolo da sola con `getInitialURL`, trovava
 * solo l'indirizzo con cui l'app era stata avviata, cioè nessuno.
 *
 * Qui il link si legge, se porta i gettoni si apre la sessione, e l'esito
 * resta a disposizione di chi lo chiede (`useEsitoLink`).
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { leggiLinkAccesso, utenteDelLink } from '@/lib/parametriLink';

/**
 * - `attesa`: il link iniziale non è ancora stato letto, o la sessione si
 *   sta aprendo;
 * - `dentro`: il link era buono, la sessione è aperta;
 * - `scaduto`: il link era scaduto, già usato o non valido;
 * - `nessuno`: non è arrivato nessun link dell'accesso.
 */
export type EsitoLink = 'attesa' | 'dentro' | 'scaduto' | 'nessuno';

// Sul web i link della posta non arrivano (portano a insieme://), e la
// sessione nell'indirizzo la raccoglie da sé il client Supabase.
let esito: EsitoLink = Platform.OS === 'web' ? 'nessuno' : 'attesa';
const ascoltatori = new Set<(e: EsitoLink) => void>();

function imposta(e: EsitoLink) {
  esito = e;
  ascoltatori.forEach((f) => f(e));
}

/** Legge un link arrivato all'app. Quelli che non riguardano l'accesso
 * (un invito, per esempio) non cambiano niente. */
export async function gestisciLink(url: string | null): Promise<void> {
  const link = leggiLinkAccesso(url);
  if (link.tipo === 'nessuno') {
    // Il link iniziale non era dell'accesso: non c'è più niente da aspettare.
    if (esito === 'attesa') imposta('nessuno');
    return;
  }
  if (link.tipo === 'errore') {
    imposta('scaduto');
    return;
  }
  // Già dentro: i codici di un link non sostituiscono l'account (un link
  // qualsiasi, anche un finto invito, faceva entrare in un altro). Il link
  // della stessa persona va bene così; quello di un'altra non vale, perché
  // la schermata della password cambierebbe quella di chi è già dentro.
  const dentro = (await supabase.auth.getSession()).data.session?.user.id;
  if (dentro) {
    imposta(dentro === utenteDelLink(link.access_token) ? 'dentro' : 'scaduto');
    return;
  }
  imposta('attesa');
  const { error } = await supabase.auth.setSession({
    access_token: link.access_token,
    refresh_token: link.refresh_token,
  });
  imposta(error ? 'scaduto' : 'dentro');
}

/** Da chiamare quando il link è stato usato: un ritorno successivo alla
 * schermata non deve ritrovarsi l'esito di quello vecchio. */
export function dimenticaEsitoLink() {
  imposta('nessuno');
}

export function useEsitoLink(): EsitoLink {
  const [valore, setValore] = useState<EsitoLink>(esito);
  useEffect(() => {
    // Nel frattempo potrebbe essere già cambiato.
    setValore(esito);
    ascoltatori.add(setValore);
    return () => {
      ascoltatori.delete(setValore);
    };
  }, []);
  return valore;
}
