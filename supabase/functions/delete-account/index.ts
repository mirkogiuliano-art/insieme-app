// Insieme — Edge Function che cancella l'account di chi la chiama.
//
// Chiamata dal client:
//   supabase.functions.invoke('delete-account')
//
// Serve una funzione sul server perché la cancellazione di un utente si
// fa solo con la chiave di servizio: un client, con la sua chiave
// pubblica, può modificare il proprio profilo ma non eliminare se stesso
// dal registro degli account.
//
// Cosa se ne va. Tutte le tabelle che puntano a `auth.users` lo fanno con
// `on delete cascade`, quindi togliendo l'utente spariscono da sole le sue
// righe: profilo, iscrizioni ai gruppi, messaggi, link, posti, reazioni,
// dispositivi registrati per le notifiche.
//
// Quello che la cascata NON risolve, e che questa funzione fa prima:
//
//  1. I gruppi rimasti vuoti. Se ero l'unico membro, togliendo la mia
//     iscrizione il gruppo resterebbe senza nessuno: invisibile a
//     chiunque (le regole di lettura lo mostrano solo ai membri) e non
//     più eliminabile da nessuno. È lo stesso difetto già corretto per
//     l'uscita da un gruppo, in 20260902120000_delete_empty_groups.sql.
//
//  2. I file caricati. Vivono nel deposito, non in una tabella, e
//     nessuna cascata li tocca: vanno rimossi a mano, cartella per
//     cartella dei gruppi che spariscono.
//
// Nei gruppi dove restano altre persone, invece, non si tocca niente
// oltre alle proprie righe: chat, link e posti sono roba di tutti, e i
// messaggi di chi se ne va spariscono insieme a lui.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'chat-media';
const PAGE = 100;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Admin = ReturnType<typeof createClient>;

/** Svuota e rimuove la cartella di un gruppo nel deposito. */
async function svuotaCartella(admin: Admin, groupId: string): Promise<number> {
  let rimossi = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(groupId, { limit: PAGE });
    if (error || !data || data.length === 0) break;
    const percorsi = data.map((f) => `${groupId}/${(f as { name: string }).name}`);
    const { error: errRimozione } = await admin.storage.from(BUCKET).remove(percorsi);
    if (errRimozione) break;
    rimossi += percorsi.length;
    if (data.length < PAGE) break;
  }
  return rimossi;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  const authHeader = req.headers.get('Authorization') ?? '';

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Non autenticato.' }), { status: 401, headers: JSON_HEADERS });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 1. I miei gruppi, e quali resterebbero senza nessuno.
  const { data: iscrizioni } = await admin.from('group_members').select('group_id').eq('user_id', userId);
  const mieiGruppi = (iscrizioni ?? []).map((r) => (r as { group_id: string }).group_id);

  const daEliminare: string[] = [];
  for (const groupId of mieiGruppi) {
    const { count } = await admin
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId);
    if ((count ?? 0) <= 1) daEliminare.push(groupId);
  }

  // 2. I file dei gruppi che spariscono, prima che spariscano le righe
  //    che li nominano: dopo non si saprebbe più dove guardare.
  let fileRimossi = 0;
  for (const groupId of daEliminare) {
    fileRimossi += await svuotaCartella(admin, groupId);
  }

  if (daEliminare.length > 0) {
    await admin.from('groups').delete().in('id', daEliminare);
  }

  // 3. L'account. Da qui in poi la cascata fa il resto.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(
    JSON.stringify({ eliminato: true, gruppiEliminati: daEliminare.length, fileRimossi }),
    { headers: JSON_HEADERS },
  );
});
