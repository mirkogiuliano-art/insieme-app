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

const DARK: ThemeColors = {
  bg: '#121A24',
  surface: '#1B2530',
  surface2: '#23303C',
  border: '#2E3B48',
  text: '#EDEFF2',
  textDim: '#93A2B0',
  textFaint: '#647485',
  amber: '#D9932E',
  inkOnAmber: '#2B2109',
  teal: '#2F9C86',
  coral: '#D9555C',
  lilac: '#8C7CE0',
  danger: '#D9555C',
};

const LIGHT: ThemeColors = {
  bg: '#F3F4EF',
  surface: '#FFFFFF',
  surface2: '#ECEEE6',
  border: '#DCE0D7',
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

export const RADIUS = { lg: 20, md: 14, sm: 9 };

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
