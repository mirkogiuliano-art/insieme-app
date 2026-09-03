// Estrazione dei metadati Open Graph dall'HTML di una pagina.
//
// Separato da index.ts di proposito: qui non c'è nessuna API di Deno né
// alcuna chiamata di rete, quindi è la parte che si può collaudare da sola
// su HTML reale — ed è anche la più facile da sbagliare.

export interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  ok: boolean;
}

/** Blocca gli indirizzi che punterebbero alla rete interna: senza questo
 * controllo la funzione sarebbe un proxy con cui sondare host privati. */
export function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host)
  ) {
    return null;
  }
  return u;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    const named = ENTITIES[code.toLowerCase()];
    if (named) return named;
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const n = parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    if (code.startsWith('#')) {
      const n = parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });
}

/** Raccoglie i tag <meta> in una mappa chiave→contenuto. L'ordine degli
 * attributi cambia da sito a sito, quindi si estraggono separatamente
 * invece di affidarsi a un'unica espressione posizionale. */
export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    // Il primo che compare vince: i duplicati a fine pagina sono di solito
    // widget di terze parti, non i metadati veri della pagina.
    if (key && content !== undefined && !(key in out)) out[key] = decodeEntities(content).trim();
  }
  return out;
}

function clean(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

export function parsePreview(html: string, finalUrl: string, requestedUrl: string): Preview {
  const meta = metaTags(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

  const title =
    clean(meta['og:title'], 200) ??
    clean(meta['twitter:title'], 200) ??
    clean(titleTag ? decodeEntities(titleTag) : null, 200);
  const description =
    clean(meta['og:description'], 300) ??
    clean(meta['twitter:description'], 300) ??
    clean(meta['description'], 300);
  const rawImage = meta['og:image'] ?? meta['og:image:secure_url'] ?? meta['twitter:image'];
  const siteName = clean(meta['og:site_name'], 80);

  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      // Molti siti indicano l'immagine con un percorso relativo.
      imageUrl = new URL(rawImage, finalUrl).toString().slice(0, 2048);
    } catch {
      imageUrl = null;
    }
  }

  return { url: requestedUrl, title, description, imageUrl, siteName, ok: !!(title || imageUrl) };
}
