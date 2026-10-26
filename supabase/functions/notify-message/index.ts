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

/** L'avviso nella lingua di chi lo riceve: quella che l'app tiene nei suoi
 * dati (`user_metadata.lang`), la stessa delle email. Senza, l'inglese. */
const TESTI = {
  it: {
    qualcuno: 'Qualcuno',
    foto: 'Ha mandato una foto',
    video: 'Ha mandato un video',
    vocale: 'Ha mandato un messaggio vocale',
    documento: 'Ha mandato un documento',
    altro: 'Ha scritto qualcosa',
  },
  en: {
    qualcuno: 'Someone',
    foto: 'Sent a photo',
    video: 'Sent a video',
    vocale: 'Sent a voice message',
    documento: 'Sent a document',
    altro: 'Wrote something',
  },
};
type Testi = (typeof TESTI)[keyof typeof TESTI];
const testiPer = (lang: unknown): Testi =>
  typeof lang === 'string' && Object.hasOwn(TESTI, lang) ? TESTI[lang as keyof typeof TESTI] : TESTI.en;

/** Cosa si legge nell'avviso. Un allegato senza testo non ha niente da
 * citare, quindi si nomina la cosa. */
function corpoAvviso(m: MessageRow, autore: string | undefined, T: Testi): string {
  let cosa: string;
  if (m.text && m.text.trim()) cosa = m.text.trim().slice(0, MAX_BODY);
  else if (m.attachment_type === 'image') cosa = T.foto;
  else if (m.attachment_type === 'video') cosa = T.video;
  else if (m.attachment_type === 'audio') cosa = T.vocale;
  else if (m.attachment_type === 'file') cosa = m.attachment_name ?? T.documento;
  else cosa = T.altro;
  return `${autore || T.qualcuno}: ${cosa}`;
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

  const [{ data: gruppo }, { data: profilo }, { data: membri }, { data: bloccanti, error: errBlocchi }] = await Promise.all([
    admin.from('groups').select('name').eq('id', msg.group_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', callerId).maybeSingle(),
    admin.from('group_members').select('user_id').eq('group_id', msg.group_id),
    admin.from('blocked_users').select('blocker_id').eq('blocked_id', callerId),
  ]);
  // Chi ha bloccato chi scrive non riceve l'avviso: in chat i suoi messaggi
  // non compaiono, e l'avviso li metterebbe sullo schermo bloccato. Senza
  // sapere chi l'ha bloccato, meglio nessun avviso che uno a chi non lo vuole.
  if (errBlocchi) {
    return new Response(JSON.stringify({ error: 'Riprova più tardi.' }), { status: 503, headers: JSON_HEADERS });
  }
  const escluso = new Set([callerId, ...(bloccanti ?? []).map((r) => (r as { blocker_id: string }).blocker_id)]);

  const destinatari = (membri ?? [])
    .map((r) => (r as { user_id: string }).user_id)
    .filter((id) => !escluso.has(id));
  if (destinatari.length === 0) {
    return new Response(JSON.stringify({ inviati: 0, motivo: 'nessun altro membro' }), { headers: JSON_HEADERS });
  }

  const { data: righe } = await admin.from('push_tokens').select('token, user_id').in('user_id', destinatari);
  const dispositivi = (righe ?? []) as { token: string; user_id: string }[];
  if (dispositivi.length === 0) {
    return new Response(JSON.stringify({ inviati: 0, motivo: 'nessun dispositivo registrato' }), { headers: JSON_HEADERS });
  }

  // shortcut: una lettura per destinatario; con gruppi da centinaia di persone conviene salvare la lingua in push_tokens.
  const ids = [...new Set(dispositivi.map((d) => d.user_id))];
  const utenti = await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)));
  const lingue = new Map(ids.map((id, k) => [id, utenti[k].data.user?.user_metadata?.lang]));

  const titolo = (gruppo as { name?: string } | null)?.name ?? 'Insieme';
  const autore = (profilo as { display_name?: string } | null)?.display_name;

  let inviati = 0;
  const daDimenticare: string[] = [];

  for (let i = 0; i < dispositivi.length; i += CHUNK) {
    const lotto = dispositivi.slice(i, i + CHUNK);
    const avvisi = lotto.map((d) => ({
      to: d.token,
      title: titolo,
      body: corpoAvviso(msg, autore, testiPer(lingue.get(d.user_id))),
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
        daDimenticare.push(lotto[k].token);
      }
    });
  }

  if (daDimenticare.length > 0) {
    await admin.from('push_tokens').delete().in('token', daDimenticare);
  }

  return new Response(JSON.stringify({ inviati, dimenticati: daDimenticare.length }), { headers: JSON_HEADERS });
});
