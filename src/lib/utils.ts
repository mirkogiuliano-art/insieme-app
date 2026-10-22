import type { LinkPlatform } from '@/types';

export function genGroupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Il primo segno di una parola come lo vede una persona. Un'emoji è fatta
 * di più unità di testo (a volte di più caratteri uniti, o con il tono
 * della pelle): prenderne "la prima lettera" con `[0]` o `slice` la taglia
 * a metà, e a schermo resta un rombo con il punto di domanda.
 */
export function primoSegno(parola: string): string {
  const pezzi = Array.from(parola);
  if (pezzi.length === 0) return '';
  let segno = pezzi[0];
  let i = 1;
  while (i < pezzi.length) {
    const cp = pezzi[i].codePointAt(0) ?? 0;
    // Selettore di variante (la versione colorata) o tono della pelle.
    if (cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff)) {
      segno += pezzi[i];
      i += 1;
    } else if (cp === 0x200d && i + 1 < pezzi.length) {
      // Unione di più emoji in una sola (famiglie, mestieri...).
      segno += pezzi[i] + pezzi[i + 1];
      i += 2;
    } else {
      break;
    }
  }
  return segno;
}

/** Le iniziali per un avatar. Chi le mostra in un cerchio di misura fissa
 * passa `maxFontSizeMultiplier={1}` al testo: con il testo di sistema
 * ingrandito le lettere uscirebbero dal cerchio. */
export function initials(name?: string): string {
  const pulito = name?.trim();
  if (!pulito) return '?';
  const parts = pulito.split(/\s+/);
  if (parts.length === 1) {
    const primo = primoSegno(parts[0]);
    return (primo + primoSegno(parts[0].slice(primo.length))).toUpperCase();
  }
  return (primoSegno(parts[0]) + primoSegno(parts[1])).toUpperCase();
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

import { dizionario, localeAttuale } from '@/i18n';

export function timeLabel(ts: number): string {
  const d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, '0') +
    ':' +
    d.getMinutes().toString().padStart(2, '0')
  );
}

export function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(localeAttuale(), { day: '2-digit', month: 'short' });
}

/** I colori delle persone, in giro per la ruota: verde acqua, azzurro,
 * lilla, orchidea, terracotta, ambra, lime, verde. Erano cinque, e in un
 * gruppo di tre due persone finivano spesso dello stesso colore (Giulia e
 * Marco erano tutti e due azzurri). Le iniziali scure si leggono su
 * ognuno (almeno 4,5:1). */
const USER_COLORS = ['#2F9C86', '#5FA8DE', '#8C7CE0', '#C97BD9', '#E0795A', '#D9932E', '#A3B83A', '#3E9950'];
export function colorForUser(name: string): string {
  return USER_COLORS[hashStr(name) % USER_COLORS.length];
}

/** Il colore di una persona quando è testo (il nome sopra un messaggio,
 * l'autore di una citazione): la tinta delle sue iniziali, schiarita o
 * scurita finché si legge su `sfondo`. */
export function inchiostroPersona(nome: string, sfondo: string): string {
  return testoLeggibile(colorForUser(nome), sfondo);
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
      setTimeout(() => reject(new Error(dizionario().errori.tempoScaduto)), ms),
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

// ── Testo sopra una tinta piena ──────────────────────────────────────

/**
 * Versione molto scura di una tinta, da usare come colore del testo
 * quando quella tinta riempie tutto lo sfondo (le schede dei gruppi
 * nella home).
 *
 * È la stessa soluzione che il tema usa già a mano per il pulsante
 * ambra — `inkOnAmber` (#2B2109) non è nero, è un ambra quasi spento —
 * solo calcolata invece che scritta una per una: le tinte dei gruppi
 * sono sette e possono cambiare, e un nero unico sopra sette colori
 * diversi risulta sempre un po' estraneo a ciascuno.
 *
 * Moltiplicare i canali per un fattore basso mantiene la tinta e ne
 * abbassa la luminosità: contro il colore di partenza il contrasto
 * resta abbondantemente sopra la soglia di leggibilità. Il fattore
 * predefinito serve al testo principale; alzandolo (circa 0,32) si
 * ottiene il tono più tenue per la riga secondaria, che resta comunque
 * leggibile — cosa che invece la semplice trasparenza non garantiva.
 */
export function inkOn(hex: string, factor = 0.17): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  // Tinta non riconosciuta (o già in forma rgb/nome): meglio un nero
  // qualsiasi che un colore illeggibile.
  if (!m) return '#111111';
  const n = parseInt(m[1], 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function canali(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function luminanza([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrasto(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LEGGIBILI = new Map<string, string>();

/**
 * Un colore scelto dal gruppo (quello di una categoria) quando fa da
 * testo: lo si scurisce su un fondo chiaro, lo si schiarisce su uno scuro,
 * finché regge 4,5:1. Il tono resta quello della categoria, cambia solo la
 * luce. `sfondo` è la superficie su cui il testo si posa.
 */
export function testoLeggibile(hex: string, sfondo: string): string {
  const chiave = `${hex}|${sfondo}`;
  const giaFatto = LEGGIBILI.get(chiave);
  if (giaFatto) return giaFatto;
  const colore = canali(hex);
  const fondo = canali(sfondo);
  if (!colore || !fondo) return hex;
  // Verso il nero su un fondo chiaro, verso il bianco su uno scuro.
  const meta: [number, number, number] = luminanza(fondo) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  let c = colore;
  for (let passo = 1; passo <= 20 && contrasto(c, fondo) < 4.5; passo++) {
    const t = passo * 0.05;
    c = colore.map((v, i) => Math.round(v + (meta[i] - v) * t)) as [number, number, number];
  }
  const risultato = `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  LEGGIBILI.set(chiave, risultato);
  return risultato;
}

/** Durata in mm:ss, per i messaggi vocali e la registrazione in corso. */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Distanza in metri fra due punti (formula dell'emisenoverso). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 m", "1,2 km", "38 km": come si dice a voce. Il separatore dei
 * decimali lo decide la lingua — virgola in italiano, punto in inglese. */
export function distanceLabel(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  if (km >= 10) return `${Math.round(km)} km`;
  return `${km.toLocaleString(localeAttuale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
