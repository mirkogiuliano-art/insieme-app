// Tipi condivisi in tutta l'app.

export type ThemeName = 'light' | 'dark';

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
