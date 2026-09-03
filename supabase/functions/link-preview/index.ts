// Insieme — Edge Function che legge i metadati Open Graph di una pagina e
// li deposita nella cache `link_previews` (vedi la migrazione
// 20260902090000_link_previews.sql).
//
// Sta sul server e non sul client per due motivi: dal browser il CORS
// impedisce di leggere l'HTML di un sito terzo, e comunque la stessa pagina
// verrebbe riscaricata da ogni membro a ogni apertura della chat.
//
// Chiamata dal client con:
//   supabase.functions.invoke('link-preview', { body: { url } })
// Il JWT dell'utente viene verificato dalla piattaforma, quindi risponde
// solo a chi è autenticato.
//
// L'analisi dell'HTML sta in ./parse.ts, che non usa API di Deno ed è
// quindi collaudabile da sola.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isPublicHttpUrl, parsePreview, type Preview } from './parse.ts';

const CACHE_DAYS = 30;
// I fallimenti si riprovano molto prima: un sito può essere stato giù per
// un momento, e un errore congelato per un mese sarebbe irrecuperabile.
const CACHE_DAYS_FAILED = 1;
// Tetto generoso di proposito: la lettura si ferma comunque appena trova
// </head>, e per la stragrande maggioranza dei siti bastano poche decine di
// KB. Ma alcune pagine molto pesanti hanno un <head> enorme — su YouTube
// og:title compare intorno al byte 696.000 — e con un tetto basso
// l'anteprima falliva in silenzio proprio sui link più condivisi.
const MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 6000;
// Alcuni siti restituiscono pagine diverse (o un blocco) a seconda del
// client: ci presentiamo come un normale crawler di anteprime.
const USER_AGENT = 'Mozilla/5.0 (compatible; InsiemeBot/1.0; +link-preview)';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Piattaforme che pubblicano i propri metadati con oEmbed, un'interfaccia
 * fatta apposta per le anteprime.
 *
 * Su queste NON si fa scraping: YouTube, visto da un indirizzo di
 * datacenter come quelli su cui gira questa funzione, risponde con una
 * pagina di consenso o di verifica anti-bot, priva di tag Open Graph —
 * verificato, l'anteprima falliva proprio sui link più condivisi. oEmbed
 * invece è pubblico, stabile e pensato per essere chiamato dai server.
 */
const OEMBED: { host: RegExp; endpoint: (u: string) => string; site: string }[] = [
  {
    host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
    endpoint: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
    site: 'YouTube',
  },
];
// Qui c'è solo YouTube di proposito: è l'unico provider di cui ho
// verificato la risposta. Le altre piattaforme passano dai tag Open Graph,
// che con loro funzionano; aggiungerne altre a scatola chiusa
// significherebbe solo sprecare una richiesta a vuoto prima del ripiego.

async function fromOEmbed(url: URL, requestedUrl: string): Promise<Preview | null> {
  const provider = OEMBED.find((p) => p.host.test(url.hostname));
  if (!provider) return null;
  try {
    const res = await fetch(provider.endpoint(url.toString()), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const title = typeof j.title === 'string' ? j.title.slice(0, 200) : null;
    const imageUrl = typeof j.thumbnail_url === 'string' ? j.thumbnail_url.slice(0, 2048) : null;
    if (!title && !imageUrl) return null;
    return {
      url: requestedUrl,
      title,
      // Per un video il canale è l'informazione utile sotto al titolo.
      description: typeof j.author_name === 'string' ? j.author_name.slice(0, 300) : null,
      imageUrl,
      siteName: provider.site,
      ok: true,
    };
  } catch {
    return null;
  }
}

/** Scarica solo l'inizio della pagina: i metadati stanno nell'<head>, e
 * senza un tetto una pagina enorme bloccherebbe la funzione. */
async function fetchHead(url: URL): Promise<{ html: string; finalUrl: string } | null> {
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
  } catch {
    return null;
  }
  if (!res.ok || !res.body) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('html')) {
    res.body.cancel();
    return null;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head\s*>/i.test(html)) break;
  }
  reader.cancel().catch(() => {});
  return { html, finalUrl: res.url || url.toString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });

  let requestedUrl = '';
  try {
    requestedUrl = String((await req.json())?.url ?? '');
  } catch {
    return new Response(JSON.stringify({ error: 'corpo non valido' }), { status: 400, headers: JSON_HEADERS });
  }
  if (requestedUrl.length > 2048) {
    return new Response(JSON.stringify({ error: 'indirizzo troppo lungo' }), { status: 400, headers: JSON_HEADERS });
  }
  const url = isPublicHttpUrl(requestedUrl);
  if (!url) {
    return new Response(JSON.stringify({ error: 'indirizzo non ammesso' }), { status: 400, headers: JSON_HEADERS });
  }

  // La chiave di servizio serve a scrivere in `link_previews`, che non ha
  // policy di scrittura proprio per impedire ai client di alterarla.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: cached } = await admin
    .from('link_previews')
    .select('url, title, description, image_url, site_name, ok, fetched_at')
    .eq('url', requestedUrl)
    .maybeSingle();

  const maxAgeDays = cached?.ok ? CACHE_DAYS : CACHE_DAYS_FAILED;
  const fresh =
    cached && Date.now() - new Date(cached.fetched_at).getTime() < maxAgeDays * 24 * 3600 * 1000;
  if (fresh) {
    return new Response(
      JSON.stringify({
        url: cached.url,
        title: cached.title,
        description: cached.description,
        imageUrl: cached.image_url,
        siteName: cached.site_name,
        ok: cached.ok,
        cached: true,
      }),
      { headers: JSON_HEADERS },
    );
  }

  // Prima oEmbed dove esiste, poi i tag Open Graph della pagina.
  let preview = await fromOEmbed(url, requestedUrl);
  if (!preview) {
    const fetched = await fetchHead(url);
    preview = fetched
      ? parsePreview(fetched.html, fetched.finalUrl, requestedUrl)
      : { url: requestedUrl, title: null, description: null, imageUrl: null, siteName: null, ok: false };
  }

  await admin.from('link_previews').upsert(
    {
      url: preview.url,
      title: preview.title,
      description: preview.description,
      image_url: preview.imageUrl,
      site_name: preview.siteName,
      ok: preview.ok,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'url' },
  );

  return new Response(JSON.stringify({ ...preview, cached: false }), { headers: JSON_HEADERS });
});
