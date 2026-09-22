import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '@/lib/storage';
import type { ThemeName, ThemePreference } from '@/types';

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

/**
 * «Giorno»: lo stesso impianto ribaltato — la carta è il livello alto, il
 * fondo quello basso — su un grigio azzurrato invece che su un bianco
 * neutro. È la stessa stanza dello scuro con la luce accesa: stessa
 * famiglia di blu, alzata di tono.
 *
 * Il fondo è **freddo di proposito**. Le prove su fondi caldi (avorio,
 * sabbia) fallivano tutte per lo stesso motivo: un accento caldo su un
 * fondo caldo smette di essere un accento e si scioglie dentro.
 *
 * E l'ambra qui non è la stessa dello scuro. Là è chiara e satura perché
 * deve essere l'unica cosa luminosa in una stanza buia; su una pagina già
 * chiara quella stessa ambra non illumina niente e resta solo rumore, così
 * scende di un paio di gradini di saturazione e diventa un ottone.
 */
const LIGHT: ThemeColors = {
  bg: '#EDF0F3',
  surface: '#FFFFFF',
  surface2: '#E2E7EC',
  border: '#DDE3E9',
  text: '#16202B',
  textDim: '#55636F',
  textFaint: '#8794A0',
  amber: '#BE8C4C',
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

/** Carattere arrotondato per i titoli che devono avere presenza, come il
 * nome del gruppo sulla sua scheda. Va usato **senza** `fontWeight`: il
 * peso è già nel nome, e su Android un peso in più lo farebbe ingrossare
 * artificialmente. Caricato in app/_layout.tsx. */
export const FONT_ROUNDED = 'Nunito_800ExtraBold';

interface ThemeContextValue {
  /** Il tema in uso adesso: con "Automatico" è quello del telefono. */
  theme: ThemeName;
  /** Quello che la persona ha scelto nelle impostazioni. */
  preference: ThemePreference;
  colors: ThemeColors;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  preference: 'dark',
  colors: DARK,
  setPreference: () => {},
});

const THEME_KEY = 'theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Scuro resta il punto di partenza per chi non ha mai scelto: è il tema
  // con cui l'app è nata, e cambiarlo di nascosto a chi la usa già
  // sarebbe una sorpresa.
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  // Segue il telefono anche mentre l'app è aperta. Su Android funziona
  // solo con expo-system-ui installato e `userInterfaceStyle: automatic`
  // in app.json: senza, il sistema dichiara sempre "chiaro".
  const system = useColorScheme();

  useEffect(() => {
    storage.get<ThemePreference>(THEME_KEY).then((p) => {
      if (p === 'light' || p === 'dark' || p === 'system') setPreferenceState(p);
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    storage.set(THEME_KEY, p);
  };

  const theme: ThemeName = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo(
    () => ({ theme, preference, colors: theme === 'light' ? LIGHT : DARK, setPreference }),
    [theme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
