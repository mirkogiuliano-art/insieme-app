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
// Si invoca con { groupId } per ripulire un solo gruppo, oppure senza
// argomenti per passare tutto il deposito.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

/** Nomi dei file ancora usati da qualcuno, nella forma `{group}/{file}`.
 * Gli indirizzi salvati sono pubblici e completi: si tiene solo la parte
 * dopo il nome del deposito, che è quella che identifica l'oggetto. */
async function referencedNames(admin: Admin, groupId: string): Promise<Set<string>> {
  const names = new Set<string>();
  const marker = `/${BUCKET}/`;
  const add = (url: string | null | undefined) => {
    if (!url) return;
    const i = url.indexOf(marker);
    if (i >= 0) names.add(decodeURIComponent(url.slice(i + marker.length)));
  };

  const { data: messages } = await admin
    .from('messages')
    .select('attachment_url')
    .eq('group_id', groupId)
    .not('attachment_url', 'is', null);
  for (const m of messages ?? []) add((m as { attachment_url: string }).attachment_url);

  const { data: links } = await admin.from('links').select('url, thumb').eq('group_id', groupId);
  for (const l of links ?? []) {
    add((l as { url: string }).url);
    add((l as { thumb: string | null }).thumb);
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
 * suoi file se ne vanno; altrimenti solo quelli che nessuna riga usa. */
async function sweepGroup(admin: Admin, groupId: string): Promise<{ deleted: number; kept: number }> {
  const files = await listFolder(admin, groupId);
  if (files.length === 0) return { deleted: 0, kept: 0 };

  const { data: group } = await admin.from('groups').select('id').eq('id', groupId).maybeSingle();
  const groupGone = !group;
  const used = groupGone ? new Set<string>() : await referencedNames(admin, groupId);

  const now = Date.now();
  const toDelete: string[] = [];
  let kept = 0;
  for (const f of files) {
    const path = `${groupId}/${f.name}`;
    const age = f.created_at ? now - new Date(f.created_at).getTime() : Number.POSITIVE_INFINITY;
    // Il gruppo eliminato non ha più nulla da proteggere: nessuna franchigia.
    if (!groupGone && (used.has(path) || age < MIN_AGE_MS)) {
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
  try {
    const body = await req.json().catch(() => ({}));
    groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  } catch {
    groupId = null;
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    // Senza gruppo indicato si passa tutto il deposito: è il modo per
    // recuperare l'arretrato, e per una pulizia periodica.
    const folders = groupId
      ? [groupId]
      : (await listFolder(admin, '')).map((f) => f.name);

    let deleted = 0;
    let kept = 0;
    for (const folder of folders) {
      const r = await sweepGroup(admin, folder);
      deleted += r.deleted;
      kept += r.kept;
    }
    return new Response(JSON.stringify({ folders: folders.length, deleted, kept }), { headers: JSON_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: JSON_HEADERS });
  }
});
