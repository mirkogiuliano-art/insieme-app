import { supabase } from '@/lib/supabase';

/**
 * Cancella il proprio account e tutto quello che ne dipende.
 *
 * Il lavoro vero lo fa l'Edge Function `delete-account`, che ha i
 * permessi per rimuovere un utente dal registro degli account: da qui si
 * può solo chiedere. La funzione si occupa anche dei gruppi rimasti
 * vuoti e dei file caricati, che nessuna cascata del database toccherebbe.
 *
 * A differenza di quasi tutto il resto dell'app, qui un errore **non**
 * viene ingoiato: se la cancellazione non riesce, chi l'ha chiesta deve
 * saperlo: far credere che i propri dati siano spariti quando sono ancora
 * tutti lì sarebbe la bugia peggiore che quest'app possa raccontare.
 */
export async function deleteMyAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  if (!data?.eliminato) throw new Error('La cancellazione non è andata a buon fine.');
}
