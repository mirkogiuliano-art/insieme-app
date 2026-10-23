// Insieme — Edge Function che avvisa una persona invitata in un gruppo
// (vedi 20261023120000_inviti_persona.sql).
//
// Chiamata dal client subito dopo l'invito:
//   supabase.functions.invoke('notify-invite', { body: { groupId, utente } })
//
// Sta sul server per le stesse ragioni di notify-message: i codici dei
// telefoni altrui si leggono solo con la chiave di servizio. E come lì,
// chi chiama può far partire l'avviso **solo per un invito suo**: la
// funzione cerca l'invito nel database, mandato da chi chiama a quella
// persona. Senza, chiunque potrebbe far suonare il telefono di chiunque.
//
// Chi ha bloccato chi invita non riceve niente: l'invito non lo vede
// nemmeno in home. Come in notify-message, nessun nuovo tentativo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const risposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asCaller.auth.getUser();
  const callerId = auth?.user?.id;
  if (!callerId) return risposta({ error: 'Non autenticato.' }, 401);

  const body = await req.json().catch(() => ({}));
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  const utente = typeof body?.utente === 'string' ? body.utente : null;
  if (!groupId || !utente) return risposta({ error: 'groupId o utente mancante.' }, 400);

  const [{ data: invito }, { data: blocco, error: errBlocco }] = await Promise.all([
    admin.from('inviti_persona').select('group_id').eq('group_id', groupId).eq('invitato_id', utente).eq('da_id', callerId).maybeSingle(),
    admin.from('blocked_users').select('blocker_id').eq('blocker_id', utente).eq('blocked_id', callerId).maybeSingle(),
  ]);
  if (!invito) return risposta({ error: 'Nessun invito tuo per questa persona.' }, 403);
  // Senza sapere se c'è un blocco, meglio nessun avviso che uno indesiderato.
  if (errBlocco) return risposta({ error: 'Riprova più tardi.' }, 503);
  if (blocco) return risposta({ inviati: 0 });

  const [{ data: gruppo }, { data: profilo }, { data: righe }] = await Promise.all([
    admin.from('groups').select('name').eq('id', groupId).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', callerId).maybeSingle(),
    admin.from('push_tokens').select('token').eq('user_id', utente),
  ]);
  const tokens = (righe ?? []).map((r) => (r as { token: string }).token);
  if (tokens.length === 0) return risposta({ inviati: 0, motivo: 'nessun dispositivo registrato' });

  const chi = (profilo as { display_name?: string } | null)?.display_name || 'Qualcuno';
  const nome = (gruppo as { name?: string } | null)?.name ?? '';
  const esito = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    // Senza groupId nei dati: toccando l'avviso si apre la home, dove
    // l'invito aspetta in cima. L'invitato nel gruppo non c'è ancora.
    body: JSON.stringify(
      tokens.map((to) => ({ to, title: 'Insieme', body: `${chi} ti invita in «${nome}»`, sound: 'default', channelId: 'messaggi', data: { invito: groupId } })),
    ),
  }).catch(() => null);
  if (!esito || !esito.ok) return risposta({ inviati: 0 });

  const dettagli = ((await esito.json().catch(() => null))?.data ?? []) as { status?: string; details?: { error?: string } }[];
  // App disinstallata o permesso revocato: il codice non vale più.
  const daDimenticare = tokens.filter((_, k) => dettagli[k]?.details?.error === 'DeviceNotRegistered');
  if (daDimenticare.length > 0) await admin.from('push_tokens').delete().in('token', daDimenticare);
  return risposta({ inviati: dettagli.filter((d) => d?.status === 'ok').length });
});
