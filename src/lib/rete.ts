/** Come si presenta un errore di rete a seconda di chi lo solleva: fetch
 * di React Native, quello del browser, o il client di Supabase (che lo
 * chiama AuthRetryableFetchError). Serve sia agli errori delle azioni
 * (errori.ts) sia a quelli dell'accesso (messaggioAuth). */
const RETE = /Network request failed|Failed to fetch|fetch failed|NetworkError|Load failed|ConnectException|UnknownHostException|SocketTimeoutException|ENOTFOUND|ECONNREFUSED/i;

/** L'azione è fallita perché manca la rete o il server non risponde. */
export function eErroreDiRete(err: unknown): boolean {
  const e = err as { message?: unknown; name?: unknown } | null | undefined;
  if (e?.name === 'AuthRetryableFetchError') return true;
  return typeof e?.message === 'string' && RETE.test(e.message);
}
