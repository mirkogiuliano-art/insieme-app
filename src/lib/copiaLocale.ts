/**
 * L'ultima copia, sul telefono, di quello che una sezione ha letto.
 *
 * Fuori casa la rete va e viene (roaming, metro, montagna): senza copia, una
 * sezione che non riusciva a ricaricarsi restava vuota anche se un minuto
 * prima mostrava tutto. Ogni sezione salva qui quello che ha appena letto e,
 * se la lettura dopo non riesce, mostra la copia con l'ora in cui era
 * aggiornata (vedi SenzaRete). Intanto riprova da sola.
 *
 * Le copie sono di chi ha fatto l'accesso: la chiave porta il suo id, e
 * uscendo dall'account si cancellano tutte (authStore).
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '@/lib/storage';

const PREFISSO = 'copia:';
/** Ogni quanto si riprova, finché i dati non si leggono. */
const RIPROVA_OGNI_MS = 15000;

export type Copia<T> = { dati: T; ts: number };

function chiave(utente: string, sezione: string): string {
  return `${PREFISSO}${utente}:${sezione}`;
}

/** Salva in sottofondo: se non riesce, resta la copia di prima. */
export function salvaCopia<T>(utente: string | undefined, sezione: string, dati: T): void {
  if (!utente) return;
  void storage.set<Copia<T>>(chiave(utente, sezione), { dati, ts: Date.now() });
}

export async function leggiCopia<T>(utente: string | undefined, sezione: string): Promise<Copia<T> | null> {
  if (!utente) return null;
  return storage.get<Copia<T>>(chiave(utente, sezione));
}

export async function svuotaCopie(): Promise<void> {
  try {
    const chiavi = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(chiavi.filter((k) => k.startsWith(PREFISSO)));
  } catch {
    // Una copia rimasta non si mostra a nessun altro: porta l'id di chi
    // l'ha salvata.
  }
}

/** Finché `attivo`, riprova ogni 15 secondi e ogni volta che l'app torna
 * in primo piano: quando la rete torna, i dati si aggiornano da soli. */
export function useRiprovaDaSola(attivo: boolean, riprova: () => void): void {
  const ultima = useRef(riprova);
  ultima.current = riprova;
  useEffect(() => {
    if (!attivo) return;
    const timer = setInterval(() => ultima.current(), RIPROVA_OGNI_MS);
    const sub = AppState.addEventListener('change', (stato) => {
      if (stato === 'active') ultima.current();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [attivo]);
}
