/**
 * Quanto è larga la finestra, nelle tre misure di Android (window size
 * classes): sotto i 600 punti un telefono; da 600 un tablet in verticale o
 * un pieghevole aperto; da 840 un tablet in orizzontale.
 *
 * Il blocco in verticale di app.json non basta a tenere l'app in forma di
 * telefono: da Android 16, sugli schermi da 600 punti in su, il sistema lo
 * ignora per le app aggiornate, e l'app si apre anche in orizzontale e a
 * finestra intera. Le schermate qui leggono la misura e cambiano forma
 * invece di allungarsi.
 */

import { useWindowDimensions } from 'react-native';

export type ClasseFinestra = 'compatta' | 'media' | 'ampia';

export function useFinestra(): { classe: ClasseFinestra; larghezza: number } {
  const { width } = useWindowDimensions();
  const classe: ClasseFinestra = width >= 840 ? 'ampia' : width >= 600 ? 'media' : 'compatta';
  return { classe, larghezza: width };
}
