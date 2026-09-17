// Insieme — Edge Function che avvisa gli altri membri di un gruppo quando
// arriva un messaggio nuovo.
//
// Chiamata dal client subito dopo aver inviato:
//   supabase.functions.invoke('notify-message', { body: { messageId } })
//
// Sta sul server per due motivi. Il primo è che serve la chiave di
// servizio per leggere i codici dei dispositivi altrui: le regole di riga
// non permettono a nessuno di vedere i telefoni degli altri, ed è giusto
// così. Il secondo è che l'indirizzo a cui si spedisce (il servizio di
// Expo) non deve essere raggiungibile a piacere dai client.
//
// Chi chiama può far partire l'avviso **solo per un proprio messaggio**:
// la funzione rilegge il messaggio dal database e confronta l'autore con
// l'utente del token. Senza questo controllo chiunque potrebbe far
// suonare il telefono di chiunque altro passando l'identificativo di un
// messaggio qualsiasi.
//
// Cosa NON fa, di proposito: non riprova, non tiene una coda, non
// garantisce la consegna. Se il telefono di chi scrive perde la rete un
// istante dopo l'invio, quel messaggio arriva lo stesso a tutti (è già
// nel database) ma senza notifica. Costruire una consegna garantita
// vorrebbe dire un trigger sul database e una coda, che è un altro
// mestiere rispetto a questa app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accetta al massimo cento avvisi per richiesta. */
const CHUNK = 100;
/** Il testo del messaggio nell'avviso: oltre non ci sta comunque. */
const MAX_BODY = 140;

interface MessageRow {
  id: string;
  group_id: string;
  user_id: string;
  text: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
}

/** Cosa si legge nell'avviso. Un allegato senza testo non ha niente da
 * citare, quindi si nomina la cosa. */
function corpoAvviso(m: MessageRow, autore: string): string {
  let cosa: string;
  if (m.text && m.text.trim()) cosa = m.text.trim().slice(0, MAX_BODY);
  else if (m.attachment_type === 'image') cosa = 'Ha mandato una foto';
  else if (m.attachment_type === 'video') cosa = 'Ha mandato un video';
  else if (m.attachment_type === 'audio') cosa = 'Ha mandato un messaggio vocale';
  else if (m.attachment_type === 'file') cosa = m.attachment_name ?? 'Ha mandato un documento';
  else cosa = 'Ha scritto qualcosa';
  return `${autore}: ${cosa}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Identità di chi chiama, letta dal suo stesso token.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  const callerId = auth?.user?.id;
  if (!callerId) {
    return new Response(JSON.stringify({ error: 'Non autenticato.' }), { status: 401, headers: JSON_HEADERS });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === 'string' ? body.messageId : null;
  if (!messageId) {
    return new Response(JSON.stringify({ error: 'messageId mancante.' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: message } = await admin
    .from('messages')
    .select('id, group_id, user_id, text, attachment_type, attachment_name')
    .eq('id', messageId)
    .maybeSingle();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Messaggio inesistente.' }), { status: 404, headers: JSON_HEADERS });
  }
  if ((message as MessageRow).user_id !== callerId) {
    // Non si avvisa per conto di un altro.
    return new Response(JSON.stringify({ error: 'Non è un tuo messaggio.' }), { status: 403, headers: JSON_HEADERS });
  }

  const msg = message as MessageRow;

  const [{ data: gruppo }, { data: profilo }, { data: membri }] = await Promise.all([
    admin.from('groups').select('name').eq('id', msg.group_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', callerId).maybeSingle(),
    admin.from('group_members').select('user_id').eq('group_id', msg.group_id),
  ]);

  const destinatari = (membri ?? [])
    .map((r) => (r as { user_id: string }).user_id)
    .filter((id) => id !== callerId);
  if (destinatari.length === 0) {
    return new Response(JSON.stringify({ inviati: 0, motivo: 'nessun altro membro' }), { headers: JSON_HEADERS });
  }

  const { data: righe } = await admin.from('push_tokens').select('token').in('user_id', destinatari);
  const tokens = (righe ?? []).map((r) => (r as { token: string }).token);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ inviati: 0, motivo: 'nessun dispositivo registrato' }), { headers: JSON_HEADERS });
  }

  const titolo = (gruppo as { name?: string } | null)?.name ?? 'Insieme';
  const autore = (profilo as { display_name?: string } | null)?.display_name || 'Qualcuno';
  const testo = corpoAvviso(msg, autore);

  let inviati = 0;
  const daDimenticare: string[] = [];

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const lotto = tokens.slice(i, i + CHUNK);
    const avvisi = lotto.map((to) => ({
      to,
      title: titolo,
      body: testo,
      sound: 'default',
      channelId: 'messaggi',
      // Serve al telefono per aprire il gruppo giusto quando si tocca
      // l'avviso, e per non mostrarlo se quel gruppo è già aperto.
      data: { groupId: msg.group_id },
    }));

    const risposta = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(avvisi),
    }).catch(() => null);

    if (!risposta || !risposta.ok) continue;

    const esito = await risposta.json().catch(() => null);
    const dettagli = (esito?.data ?? []) as { status?: string; details?: { error?: string } }[];
    dettagli.forEach((d, k) => {
      if (d?.status === 'ok') {
        inviati++;
      } else if (d?.details?.error === 'DeviceNotRegistered') {
        // App disinstallata o permesso revocato: il codice non vale più,
        // e tenerlo significherebbe ritentare a vuoto per sempre.
        daDimenticare.push(lotto[k]);
      }
    });
  }

  if (daDimenticare.length > 0) {
    await admin.from('push_tokens').delete().in('token', daDimenticare);
  }

  return new Response(JSON.stringify({ inviati, dimenticati: daDimenticare.length }), { headers: JSON_HEADERS });
});
