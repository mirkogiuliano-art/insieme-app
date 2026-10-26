// Insieme — Edge Function che avvisa i membri quando chi ha creato il gruppo
// lo rende pubblico (vedi 20261026090000_gruppi_pubblici.sql): i salvati e
// i posti che hanno aggiunto loro diventano visibili a tutti.
//
// Chiamata dal client subito dopo:
//   supabase.functions.invoke('notify-pubblico', { body: { groupId } })
//
// Come notify-message e notify-invite: i codici dei telefoni si leggono
// solo con la chiave di servizio, e l'avviso parte solo se chi chiama ha
// creato il gruppo e il gruppo è davvero pubblico. Chi ha bloccato chi
// l'ha reso pubblico non riceve niente. Nessun nuovo tentativo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accetta al massimo cento avvisi per richiesta. */
const CHUNK = 100;

const risposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS });

/** L'avviso nella lingua di chi lo riceve: quella che l'app tiene nei suoi
 * dati (`user_metadata.lang`), la stessa delle email. Senza, l'inglese. */
const TESTI = {
  it: {
    qualcuno: 'Qualcuno',
    reso: (chi: string) => `${chi} l’ha reso pubblico: chiunque su Insieme ne vede info, salvati e posti. La chat resta vostra.`,
  },
  en: {
    qualcuno: 'Someone',
    reso: (chi: string) => `${chi} made it public: anyone on Insieme sees its info, saved items and places. The chat stays yours.`,
  },
};
const testiPer = (lang: unknown) => (typeof lang === 'string' && Object.hasOwn(TESTI, lang) ? TESTI[lang as keyof typeof TESTI] : TESTI.en);

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
  if (!groupId) return risposta({ error: 'groupId mancante.' }, 400);

  const { data: gruppo } = await admin.from('groups').select('name, created_by, pubblico').eq('id', groupId).maybeSingle();
  const g = gruppo as { name: string; created_by: string | null; pubblico: boolean } | null;
  if (!g || g.created_by !== callerId || !g.pubblico) return risposta({ error: 'Non è un tuo gruppo pubblico.' }, 403);

  const [{ data: membri }, { data: bloccanti, error: errBlocchi }, { data: profilo }] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', groupId),
    admin.from('blocked_users').select('blocker_id').eq('blocked_id', callerId),
    admin.from('profiles').select('display_name').eq('id', callerId).maybeSingle(),
  ]);
  // Senza sapere chi l'ha bloccato, meglio nessun avviso che uno indesiderato.
  if (errBlocchi) return risposta({ error: 'Riprova più tardi.' }, 503);
  const escluso = new Set([callerId, ...(bloccanti ?? []).map((r) => (r as { blocker_id: string }).blocker_id)]);
  const destinatari = (membri ?? []).map((r) => (r as { user_id: string }).user_id).filter((id) => !escluso.has(id));
  if (destinatari.length === 0) return risposta({ inviati: 0, motivo: 'nessun altro membro' });

  const { data: righe } = await admin.from('push_tokens').select('token, user_id').in('user_id', destinatari);
  const dispositivi = (righe ?? []) as { token: string; user_id: string }[];
  if (dispositivi.length === 0) return risposta({ inviati: 0, motivo: 'nessun dispositivo registrato' });

  // shortcut: una lettura per destinatario; con gruppi da centinaia di persone conviene salvare la lingua in push_tokens.
  const ids = [...new Set(dispositivi.map((d) => d.user_id))];
  const utenti = await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)));
  const lingue = new Map(ids.map((id, k) => [id, utenti[k].data.user?.user_metadata?.lang]));

  const nome = (profilo as { display_name?: string } | null)?.display_name;
  const testo = (userId: string) => {
    const T = testiPer(lingue.get(userId));
    return T.reso(nome || T.qualcuno);
  };

  let inviati = 0;
  const daDimenticare: string[] = [];
  for (let i = 0; i < dispositivi.length; i += CHUNK) {
    const lotto = dispositivi.slice(i, i + CHUNK);
    const esito = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // Con groupId: toccando l'avviso si apre il gruppo.
      body: JSON.stringify(
        lotto.map((d) => ({ to: d.token, title: g.name, body: testo(d.user_id), sound: 'default', channelId: 'messaggi', data: { groupId } })),
      ),
    }).catch(() => null);
    if (!esito || !esito.ok) continue;
    const dettagli = ((await esito.json().catch(() => null))?.data ?? []) as { status?: string; details?: { error?: string } }[];
    dettagli.forEach((d, k) => {
      if (d?.status === 'ok') inviati++;
      // App disinstallata o permesso revocato: il codice non vale più.
      else if (d?.details?.error === 'DeviceNotRegistered') daDimenticare.push(lotto[k].token);
    });
  }
  if (daDimenticare.length > 0) await admin.from('push_tokens').delete().in('token', daDimenticare);
  return risposta({ inviati });
});
