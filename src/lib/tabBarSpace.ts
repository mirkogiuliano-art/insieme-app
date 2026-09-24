import { createContext, useContext } from 'react';

/**
 * Quanto spazio occupa, dal fondo, la barra delle sezioni di un gruppo.
 *
 * La barra galleggia sopra il contenuto invece di stargli sotto: le liste
 * le scorrono dietro fino al bordo dello schermo. Ogni sezione però deve
 * sapere quanto lasciare libero in fondo, perché l'ultimo link, il campo di
 * scrittura o la scheda di un posto non finiscano nascosti dietro di lei.
 * Vale 0 quando la barra non c'è (tastiera aperta).
 */
export const TabBarSpaceContext = createContext(0);

export function useTabBarSpace() {
  return useContext(TabBarSpaceContext);
}
