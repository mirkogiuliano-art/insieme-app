import { supabase } from '@/lib/supabase';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  ok: boolean;
}

interface PreviewRow {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  ok: boolean;
}

function toPreview(row: PreviewRow): LinkPreview {
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    siteName: row.site_name,
    ok: row.ok,
  };
}

/** Cache in memoria per la sessione: la stessa chat mostra spesso lo stesso
 * link in più punti e viene ridisegnata di continuo. */
const memory = new Map<string, LinkPreview | null>();
/** Richieste già in volo, per non partire N volte sullo stesso indirizzo
 * quando più fumetti compaiono insieme. */
const inflight = new Map<string, Promise<LinkPreview | null>>();

async function load(url: string): Promise<LinkPreview | null> {
  // Prima la cache condivisa: è una semplice select, molto più leggera che
  // svegliare la Edge Function.
  const { data } = await supabase
    .from('link_previews')
    .select('url, title, description, image_url, site_name, ok')
    .eq('url', url)
    .maybeSingle();
  if (data) return toPreview(data as PreviewRow);

  // Mai vista: la funzione la scarica, la deposita in cache e la restituisce.
  const { data: fn, error } = await supabase.functions.invoke('link-preview', { body: { url } });
  if (error || !fn) return null;
  const p = fn as Partial<LinkPreview>;
  return {
    url,
    title: p.title ?? null,
    description: p.description ?? null,
    imageUrl: p.imageUrl ?? null,
    siteName: p.siteName ?? null,
    ok: p.ok ?? false,
  };
}

/** Metadati della pagina, oppure `null` se non sono recuperabili. Chi
 * chiama deve continuare a funzionare con `null`: l'anteprima è un
 * miglioramento, non un requisito. */
export async function getLinkPreview(url: string): Promise<LinkPreview | null> {
  if (memory.has(url)) return memory.get(url) ?? null;
  const running = inflight.get(url);
  if (running) return running;

  const promise = load(url)
    .catch(() => null)
    .then((result) => {
      memory.set(url, result);
      inflight.delete(url);
      return result;
    });
  inflight.set(url, promise);
  return promise;
}
