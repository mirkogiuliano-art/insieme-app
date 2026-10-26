// Insieme — pulizia dei file rimasti senza nulla che li usi.
//
// I file caricati (foto, video, vocali) vivono nel deposito `chat-media`
// sotto `{group_id}/{uuid}.{est}`, e finora non venivano mai cancellati:
// eliminando un link o un gruppo intero il file restava lì per sempre, a
// occupare spazio che si paga.
//
// PERCHÉ UNA SPAZZATA E NON UNA CANCELLAZIONE PUNTUALE. Cancellare il file
// "nel momento in cui" si elimina la riga sembra più diretto, ma basta che
// l'app si chiuda o la rete cada fra le due operazioni per lasciare un
// orfano che nessuno noterà mai più. Qui invece si guarda lo stato di
// fatto — quali file non sono più referenziati da niente — e si ripulisce.
// Una chiamata persa non è un problema: la ripassata successiva rimedia, e
// l'arretrato accumulato finora viene recuperato alla prima esecuzione.
//
// Si invoca con { groupId } per ripulire un solo gruppo, da un membro (o da
// chi ne è appena uscito per ultimo), oppure senza argomenti per passare
// tutto il deposito: questo solo con la chiave di servizio.
//
// Con { groupId, urls } chi chiama indica anche i file delle righe che ha
// appena tolto (un messaggio, un link, un account cancellato): quelli non
// sono invii in corso e se ne vanno subito, senza aspettare la franchigia,
// purché nessun'altra riga li usi ancora.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tutteLeRighe } from '../_shared/righe.ts';

const BUCKET = 'chat-media';
// Un file appena caricato non è ancora referenziato: la riga che lo userà
// viene scritta subito dopo. Senza questa franchigia la spazzata potrebbe
// cancellare un allegato mentre lo si sta ancora inviando.
const MIN_AGE_MS = 24 * 3600 * 1000;
const PAGE = 1000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Admin = ReturnType<typeof createClient>;

/** Il nome dell'oggetto, `{group}/{file}`, dentro un indirizzo salvato. Gli
 * indirizzi sono pubblici e completi: conta solo la parte dopo il nome del
 * deposito, che è quella che identifica l'oggetto. */
function nomeNelDeposito(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

/** Nomi dei file ancora usati da qualcuno, nella forma `{group}/{file}`. */
async function referencedNames(admin: Admin, groupId: string): Promise<Set<string>> {
  const names = new Set<string>();
  const add = (url: string | null | undefined) => {
    const nome = nomeNelDeposito(url);
    if (nome) names.add(nome);
  };

  // Una lettura fallita non vuol dire «nessun file usato»: tutteLeRighe la
  // rilancia e si ferma tutto, altrimenti si cancellerebbero file ancora in chat.
  const messages = await tutteLeRighe<{ attachment_url: string }>((da, a) =>
    admin
      .from('messages')
      .select('attachment_url')
      .eq('group_id', groupId)
      .not('attachment_url', 'is', null)
      .order('id')
      .range(da, a),
  );
  for (const m of messages) add(m.attachment_url);

  const links = await tutteLeRighe<{ url: string; thumb: string | null }>((da, a) =>
    admin.from('links').select('url, thumb').eq('group_id', groupId).order('id').range(da, a),
  );
  for (const l of links) {
    add(l.url);
    add(l.thumb);
  }

  return names;
}

async function listFolder(admin: Admin, folder: string): Promise<{ name: string; created_at?: string }[]> {
  const out: { name: string; created_at?: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: PAGE, offset });
    if (error || !data || data.length === 0) break;
    out.push(...(data as { name: string; created_at?: string }[]));
    if (data.length < PAGE) break;
  }
  return out;
}

/** Ripulisce la cartella di un gruppo. Se il gruppo non esiste più, tutti i
 * suoi file se ne vanno; altrimenti solo quelli che nessuna riga usa. I file
 * `appenaTolti` non hanno la franchigia degli invii in corso. */
async function sweepGroup(admin: Admin, groupId: string, appenaTolti: Set<string>): Promise<{ deleted: number; kept: number }> {
  const files = await listFolder(admin, groupId);
  if (files.length === 0) return { deleted: 0, kept: 0 };

  const { data: group, error } = await admin.from('groups').select('id').eq('id', groupId).maybeSingle();
  // Con un errore il gruppo sembrerebbe sparito, e se ne andrebbero tutti i file.
  if (error) throw error;
  const groupGone = !group;
  const used = groupGone ? new Set<string>() : await referencedNames(admin, groupId);

  const now = Date.now();
  const toDelete: string[] = [];
  let kept = 0;
  for (const f of files) {
    const path = `${groupId}/${f.name}`;
    const age = f.created_at ? now - new Date(f.created_at).getTime() : Number.POSITIVE_INFINITY;
    // Il gruppo eliminato non ha più nulla da proteggere: nessuna franchigia.
    if (!groupGone && (used.has(path) || (age < MIN_AGE_MS && !appenaTolti.has(path)))) {
      kept++;
      continue;
    }
    toDelete.push(path);
  }

  for (let i = 0; i < toDelete.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET).remove(toDelete.slice(i, i + 100));
    if (error) throw error;
  }
  return { deleted: toDelete.length, kept };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  let groupId: string | null = null;
  // Anche un membro può indicare file «appena tolti»: tocca solo quelli che
  // nessuna riga usa, cioè al più l'invio in corso di qualcun altro, il cui
  // indirizzo casuale non si conosce prima che il messaggio esista.
  let appenaTolti = new Set<string>();
  try {
    const body = await req.json().catch(() => ({}));
    groupId = typeof body?.groupId === 'string' ? body.groupId : null;
    const urls: unknown[] = Array.isArray(body?.urls) ? body.urls : [];
    appenaTolti = new Set(urls.map(nomeNelDeposito).filter((n): n is string => n !== null));
  } catch {
    groupId = null;
  }

  const chiaveServizio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, chiaveServizio, { auth: { persistSession: false } });

  // Chi chiama. La chiave pubblica dell'app sta in ogni telefono: senza
  // questi controlli chiunque potrebbe far ripassare tutto il deposito.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${chiaveServizio}`) {
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: auth } = await asCaller.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Non autenticato.' }), { status: 401, headers: JSON_HEADERS });
    // Dall'app si ripulisce un gruppo solo: il proprio, oppure uno appena
    // eliminato (uscendo per ultimi), che non ha più membri da controllare.
    if (!groupId) return new Response(JSON.stringify({ error: 'Gruppo mancante.' }), { status: 403, headers: JSON_HEADERS });
    const [{ data: gruppo, error: errGruppo }, { count, error: errMembro }] = await Promise.all([
      admin.from('groups').select('id').eq('id', groupId).maybeSingle(),
      admin.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', groupId).eq('user_id', userId),
    ]);
    if (errGruppo || errMembro) return new Response(JSON.stringify({ error: 'Riprova più tardi.' }), { status: 503, headers: JSON_HEADERS });
    if (gruppo && !count) return new Response(JSON.stringify({ error: 'Gruppo non trovato.' }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    // Senza gruppo indicato si passa tutto il deposito: è il modo per
    // recuperare l'arretrato, e per una pulizia periodica.
    const folders = groupId
      ? [groupId]
      : (await listFolder(admin, '')).map((f) => f.name);

    let deleted = 0;
    let kept = 0;
    for (const folder of folders) {
      const r = await sweepGroup(admin, folder, appenaTolti);
      deleted += r.deleted;
      kept += r.kept;
    }
    return new Response(JSON.stringify({ folders: folders.length, deleted, kept }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: JSON_HEADERS });
  }
});
