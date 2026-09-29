/**
 * I parametri di un link dell'accesso, dovunque Supabase li abbia messi.
 *
 * Tornando all'app dopo il link della posta, Supabase mette i gettoni
 * **dopo il `#`** (`insieme://reset-password#access_token=…&refresh_token=…`)
 * e, secondo i casi, gli errori dopo il `#` o dopo il `?`. `Linking.parse` di
 * expo-linking guarda solo dopo il `?`: è per questo che la schermata della
 * nuova password rispondeva sempre «Link scaduto», anche a un link buono.
 *
 * Sta in un file suo, senza dipendenze, perché è la parte da provare.
 */

export type LinkAccesso =
  | { tipo: 'gettoni'; access_token: string; refresh_token: string }
  | { tipo: 'errore'; codice: string }
  | { tipo: 'nessuno' };

export function leggiLinkAccesso(url: string | null | undefined): LinkAccesso {
  if (!url) return { tipo: 'nessuno' };
  const [primaDelCancelletto, frammento] = url.split('#', 2);
  const query = primaDelCancelletto.split('?', 2)[1];

  const p = new URLSearchParams();
  for (const parte of [query, frammento]) {
    if (parte) new URLSearchParams(parte).forEach((v, k) => p.set(k, v));
  }

  const errore = p.get('error_code') || p.get('error');
  if (errore) return { tipo: 'errore', codice: errore };

  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) return { tipo: 'gettoni', access_token, refresh_token };
  return { tipo: 'nessuno' };
}
