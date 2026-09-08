import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '@/lib/storage';
import type { ThemeName } from '@/types';

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  amber: string;
  inkOnAmber: string;
  teal: string;
  coral: string;
  lilac: string;
  danger: string;
}

/**
 * Stile "Notte".
 *
 * Il fondo è più profondo di prima e le superfici più chiare: la
 * differenza fra i due livelli è quello che separa una scheda dallo
 * sfondo, al posto del contorno da un pixel che prima circondava ogni
 * cosa. Il contorno resta come token perché in qualche punto serve
 * ancora davvero (il campo di testo, il pulsante secondario), ma è ormai
 * un accenno: non deve più disegnare scatole.
 *
 * L'ambra è un po' più viva di prima perché il fondo su cui si posa è
 * più scuro, e a parità di colore sarebbe sembrata spenta.
 */
const DARK: ThemeColors = {
  bg: '#0E141B',
  surface: '#18212B',
  surface2: '#212C38',
  border: '#26313D',
  text: '#E8EDF2',
  textDim: '#93A3B2',
  textFaint: '#5F6E7D',
  amber: '#E9A23B',
  inkOnAmber: '#23190A',
  teal: '#4FB3A5',
  coral: '#E4707A',
  lilac: '#9A8BEA',
  danger: '#E4707A',
};

/** Lo stesso impianto ribaltato: la carta è il livello alto, il fondo
 * quello basso, e i contorni sono altrettanto discreti. */
const LIGHT: ThemeColors = {
  bg: '#F1F2EC',
  surface: '#FFFFFF',
  surface2: '#E9EBE2',
  border: '#E3E6DC',
  text: '#1B2530',
  textDim: '#57646F',
  textFaint: '#828E97',
  amber: '#D9932E',
  inkOnAmber: '#2B2109',
  teal: '#2F9C86',
  coral: '#D9555C',
  lilac: '#8C7CE0',
  danger: '#D9555C',
};

/** Angoli più larghi di prima: senza contorni la forma è l'unica cosa
 * che distingue una superficie, e una forma morbida si stacca meglio. */
export const RADIUS = { lg: 26, md: 18, sm: 12 };
/** Le pastiglie: pulsante principale, barra delle sezioni, campo di
 * scrittura. */
export const RADIUS_PILL = 999;

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  colors: DARK,
  setTheme: () => {},
});

const THEME_KEY = 'theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');

  useEffect(() => {
    storage.get<ThemeName>(THEME_KEY).then((t) => {
      if (t === 'light' || t === 'dark') setThemeState(t);
    });
  }, []);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    storage.set(THEME_KEY, t);
  };

  const value = useMemo(
    () => ({ theme, colors: theme === 'light' ? LIGHT : DARK, setTheme }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
