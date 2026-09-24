// Tipi condivisi in tutta l'app.

export type ThemeName = 'light' | 'dark';
/** La scelta della persona: un tema fisso, oppure quello del telefono. */
export type ThemePreference = ThemeName | 'system';

export interface Profile {
  id: string; // = auth.users.id
  displayName: string | null;
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
  /** La meta: un posto gia' salvato nella mappa del gruppo. */
  placePinId?: string | null;
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
