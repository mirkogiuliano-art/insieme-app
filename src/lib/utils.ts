import type { LinkPlatform } from '@/types';

export function genGroupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function timeLabel(ts: number): string {
  const d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, '0') +
    ':' +
    d.getMinutes().toString().padStart(2, '0')
  );
}

export function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

const USER_COLORS = ['#2F9C86', '#8C7CE0', '#D9932E', '#5FA8DE', '#3E9950'];
export function colorForUser(name: string): string {
  return USER_COLORS[hashStr(name) % USER_COLORS.length];
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

export interface PlatformInfo {
  platform: LinkPlatform;
  label: string;
  thumb: string | null;
  host: string;
}

export function platformInfo(url: string): PlatformInfo {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = url;
  }
  if (/youtube\.com|youtu\.be/i.test(host)) {
    const id = extractYouTubeId(url);
    return {
      platform: 'youtube',
      label: 'YouTube',
      thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null,
      host,
    };
  }
  if (/instagram\.com/i.test(host))
    return { platform: 'instagram', label: 'Instagram', thumb: null, host };
  if (/tiktok\.com/i.test(host))
    return { platform: 'tiktok', label: 'TikTok', thumb: null, host };
  if (/twitter\.com|x\.com/i.test(host))
    return { platform: 'twitter', label: 'X / Twitter', thumb: null, host };
  if (/vimeo\.com/i.test(host))
    return { platform: 'vimeo', label: 'Vimeo', thumb: null, host };
  if (/spotify\.com/i.test(host))
    return { platform: 'spotify', label: 'Spotify', thumb: null, host };
  return { platform: 'web', label: host || 'Link', thumb: null, host };
}

export function normalizeUrl(raw: string): string {
  let n = raw.trim();
  if (!/^https?:\/\//i.test(n)) n = 'https://' + n;
  return n;
}

// ── Riconoscimento dei link dentro un testo libero ──────────────────

const URL_IN_TEXT_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
// La punteggiatura finale quasi mai fa parte dell'indirizzo: in "guarda
// qui https://esempio.it/pagina." il punto chiude la frase. Le parentesi
// chiuse si tolgono solo se non ne è stata aperta una dentro l'indirizzo.
const TRAILING_RE = /[.,;:!?'"]+$/;

function trimUrlTail(raw: string): { url: string; tail: string } {
  let url = raw;
  let tail = '';
  const punct = TRAILING_RE.exec(url);
  if (punct) {
    tail = punct[0] + tail;
    url = url.slice(0, -punct[0].length);
  }
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    tail = ')' + tail;
    url = url.slice(0, -1);
  }
  return { url, tail };
}

export interface TextSegment {
  text: string;
  /** Indirizzo già normalizzato e pronto per `Linking.openURL`, oppure
   * `null` se il segmento è testo normale. */
  url: string | null;
}

/** Divide un testo in segmenti alternati testo/indirizzo, così che chi
 * disegna possa rendere toccabili solo i secondi. */
export function splitTextByUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT_RE)) {
    const start = match.index ?? 0;
    const { url, tail } = trimUrlTail(match[0]);
    if (!url) continue;
    if (start > last) segments.push({ text: text.slice(last, start), url: null });
    segments.push({ text: url, url: normalizeUrl(url) });
    if (tail) segments.push({ text: tail, url: null });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), url: null });
  return segments.length > 0 ? segments : [{ text, url: null }];
}

/** Primo indirizzo contenuto nel testo, per l'anteprima. */
export function firstUrl(text: string): string | null {
  return splitTextByUrls(text).find((s) => s.url)?.url ?? null;
}

// ── Riconoscimento dei link di Google Maps ──────────────────────────
// Serve a proporre "salva anche come posto sulla mappa" quando qualcuno
// incolla un link di Maps nella sezione Link. È un aiuto opportunistico:
// i link brevi (maps.app.goo.gl) non contengono le coordinate e vanno
// risolti seguendo il redirect, cosa che qui non facciamo — in quel caso
// `parseGoogleMapsUrl` ritorna null e resta il normale salvataggio a mano.

export interface MapsPlaceInfo {
  lat: number;
  lng: number;
  name: string | null;
}

const COORD = '(-?\\d+(?:\\.\\d+)?)';

function isGoogleMapsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'maps.app.goo.gl' || host === 'maps.google.com') return true;
    if (host === 'goo.gl') return u.pathname.startsWith('/maps');
    if (/^google\.[a-z.]+$/.test(host)) return u.pathname.startsWith('/maps');
    return false;
  } catch {
    return false;
  }
}

function placeNameFromMapsUrl(url: string): string | null {
  const m = /\/maps\/place\/([^/@?]+)/.exec(url);
  if (!m) return null;
  try {
    const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    // Quando il posto non ha un nome, Google mette le coordinate al suo posto.
    if (!name || new RegExp(`^${COORD},\\s*${COORD}$`).test(name)) return null;
    return name.slice(0, 60);
  } catch {
    return null;
  }
}

export function parseGoogleMapsUrl(url: string): MapsPlaceInfo | null {
  if (!isGoogleMapsUrl(url)) return null;
  // `!3d<lat>!4d<lng>` è la posizione reale del luogo; `@lat,lng` è solo il
  // centro dell'inquadratura (di solito coincidono, ma non sempre).
  let m = new RegExp(`!3d${COORD}!4d${COORD}`).exec(url) ?? new RegExp(`@${COORD},${COORD}`).exec(url);
  if (!m) {
    // Formato "condividi" e "search API": ?q=lat,lng oppure ?query=lat,lng.
    try {
      const params = new URL(url).searchParams;
      const raw = params.get('q') ?? params.get('query') ?? params.get('destination') ?? '';
      m = new RegExp(`^\\s*${COORD}\\s*,\\s*${COORD}\\s*$`).exec(raw);
    } catch {
      // ignora
    }
  }
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, name: placeNameFromMapsUrl(url) };
}

/** Indirizzo canonico della scheda di un luogo, quando ne conosciamo
 * l'identificativo Google (arriva dal tocco su un punto di interesse
 * della mappa). È l'unico modo per aprire davvero *quel* posto. */
export function googleMapsPlaceUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/**
 * Indirizzo da usare per il pulsante "Apri in Google Maps" di un posto.
 *
 * Se abbiamo l'indirizzo del luogo (`mapsUrl`) si apre la sua scheda. In
 * mancanza si cerca il nome *centrando la mappa sulle coordinate salvate*:
 * non è garantito come l'identificativo, ma per un ristorante salvato al
 * suo indirizzo esatto porta alla scheda giusta, mentre la sola coordinata
 * poteva solo piantare uno spillo mostrando i gradi come titolo.
 */
export function mapsUrlForPlace(place: {
  name: string;
  lat: number;
  lng: number;
  mapsUrl?: string | null;
}): string {
  if (place.mapsUrl) return place.mapsUrl;
  const query = encodeURIComponent(place.name.trim());
  if (!query) return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  return `https://www.google.com/maps/search/${query}/@${place.lat},${place.lng},17z`;
}

/**
 * Impone un tempo massimo a una lettura.
 *
 * Serve perché una richiesta che non riceve mai risposta — rete che cade a
 * metà, portale captivo, server che non risponde — lascia la promessa
 * appesa per sempre: la schermata resta vuota senza spiegazione, che è
 * indistinguibile da "non c'è niente". Superato il limite si preferisce un
 * errore dichiarato, che almeno si può riprovare.
 */
/** Limite per le scritture normali. */
export const WRITE_TIMEOUT = 15000;
/** Limite per i caricamenti di file, che possono legittimamente essere
 * lenti: un video su rete mobile non è un errore, è solo lungo. */
export const UPLOAD_TIMEOUT = 90000;

export function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('La richiesta ha impiegato troppo tempo.')), ms),
    ),
  ]);
}

// ── Allegati non multimediali (PDF, Word, Excel, ...) ────────────────
// Il colore vero e proprio lo sceglie chi disegna (dipende dal tema
// chiaro/scuro), qui si decide solo QUALE categoria è: la UI mappa
// 'pdf'/'word'/'excel' sui propri token di colore (coral/lilac/teal).

export type FileKind = 'pdf' | 'word' | 'excel' | 'other';

function extensionOf(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function fileKindFor(name: string): FileKind {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel';
  return 'other';
}

/** Etichetta breve da mostrare sulla card ("PDF", "DOCX"...). Senza
 * estensione riconoscibile, un'etichetta generica invece di una vuota. */
export function fileLabelFor(name: string): string {
  const ext = extensionOf(name);
  return ext ? ext.toUpperCase() : 'FILE';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Durata in mm:ss, per i messaggi vocali e la registrazione in corso. */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
