// Tipi condivisi in tutta l'app.

export type ThemeName = 'light' | 'dark';
/** La scelta della persona: un tema fisso, oppure quello del telefono. */
export type ThemePreference = ThemeName | 'system';

/** Le lingue in cui l'app sa parlare. Il codice è quello ISO, lo stesso che
 * usano il telefono e `Intl`. */
export type LanguageName = 'it' | 'en';
/** Come per il tema: una lingua fissa, oppure quella del telefono. */
export type LanguagePreference = LanguageName | 'system';

export interface Profile {
  id: string; // = auth.users.id
  displayName: string | null;
  /** Il nome con cui gli altri la trovano: c'è solo da quando ha reso
   * pubblico un gruppo (vedi Visibilita). */
  nomeUtente?: string | null;
}

/** Una meta trovata cercando per nome, fuori dalla mappa del gruppo: al
 * tocco si apre la sua scheda su Google Maps. */
export interface MetaLibera {
  nome: string;
  lat: number;
  lng: number;
  mapsUrl: string;
}

export interface Group {
  id: string; // codice invito a 6 caratteri
  name: string;
  color: string;
  createdBy?: string;
  createdAt: number;
  joinedAt?: number;
  /** Le info del gruppo: a cosa serve, quando e dove. Tutte facoltative —
   * un gruppo che non e' un viaggio ha solo la descrizione, o niente. */
  description?: string | null;
  startsOn?: string | null; // 'AAAA-MM-GG'
  endsOn?: string | null;
  /** La meta: un posto gia' salvato nella mappa del gruppo... */
  placePinId?: string | null;
  /** ...oppure uno trovato cercando, che nella mappa non c'e'. */
  metaLibera?: MetaLibera | null;
  /** Pubblico: chiunque su Insieme ne vede info, link e posti, mai la chat.
   * Lo decide solo chi l'ha creato (vedi Visibilita). */
  pubblico?: boolean;
  infoUpdatedBy?: string | null;
  infoUpdatedAt?: number | null;
}

export type LinkPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'twitter'
  | 'vimeo'
  | 'spotify'
  | 'web'
  // File caricati direttamente (non un link esterno) — vedi src/lib/api/mediaUpload.ts.
  | 'image'
  | 'video'
  | 'file';

export const GROUP_PALETTE = [
  '#D9932E',
  '#2F9C86',
  '#D9555C',
  '#8C7CE0',
  '#5FA8DE',
  '#3E9950',
  '#C97BD9',
];

export const CATEGORY_PALETTE = [...GROUP_PALETTE];
