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
  /** L'ambra quando è testo o icona su una superficie, non il fondo di un
   * tasto. Nello scuro coincide con `amber`; nel chiaro è più profonda,
   * perché l'ambra piena su bianco non si legge (2,2:1). */
  amberText: string;
  inkOnAmber: string;
  /** I propri messaggi. Non sono l'ambra dei tasti: un fumetto è un blocco
   * grande, e l'ambra piena su tanti fumetti di fila, accanto al fondo
   * grigio azzurro che ne è l'opposto, pesava troppo (soprattutto nel
   * chiaro). Nel chiaro è un miele chiaro — schiarita, non spenta: spenta
   * diventava ottone — nello scuro un'ambra un tono più bassa. */
  mio: string;
  suMio: string;
  /** Ora, spunta e testo citato dentro un proprio messaggio. */
  tenueSuMio: string;
  citazioneMio: string;
  lineaCitazioneMio: string;
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
  // I due grigi del testo reggono il contrasto minimo (4,5:1) anche sulla
  // superficie più chiara, `surface2`: il tenue serve a segnaposto, orari e
  // didascalie, che vanno letti. Il secondario si alza con lui per restare
  // un gradino sopra.
  textDim: '#ACB9C4',
  textFaint: '#8493A2',
  amber: '#E9A23B',
  amberText: '#E9A23B',
  inkOnAmber: '#23190A',
  mio: '#D49C4E',
  suMio: '#23190A',
  tenueSuMio: '#4A3412',
  citazioneMio: '#E6B46C',
  lineaCitazioneMio: '#5C4214',
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
 * L'ambra invece è **la stessa dello scuro**. Per un po' qui è stata
 * abbassata di saturazione, per paura che su una pagina già chiara quella
 * accesa fosse troppo: il risultato però non era un'ambra più discreta ma
 * un ottone, che su bianco legge come un colore sporco. Meglio la tinta
 * piena: il tasto è la cosa che si tocca, e deve sembrare acceso in tutti
 * e due i temi.
 */
const LIGHT: ThemeColors = {
  bg: '#EDF0F3',
  surface: '#FFFFFF',
  surface2: '#E2E7EC',
  border: '#DDE3E9',
  text: '#16202B',
  textDim: '#414C55',
  textFaint: '#5C6974',
  amber: '#E9A23B',
  amberText: '#88570F',
  inkOnAmber: '#2B2109',
  mio: '#FBE3BA',
  suMio: '#2B2109',
  tenueSuMio: '#74521A',
  citazioneMio: '#F1CF96',
  lineaCitazioneMio: '#C98A22',
  // Verde acqua, lilla e rosso servono sia da testo sia da fondo: qui sono
  // il gradino più chiaro che regge 4,5:1 su tutte e tre le superfici del
  // chiaro. Il rosso così porta anche il bianco sopra (5,6:1, prima 3,9).
  teal: '#237363',
  coral: '#D9555C',
  lilac: '#6651D6',
  danger: '#C32C34',
};

/** Angoli più larghi di prima: senza contorni la forma è l'unica cosa
 * che distingue una superficie, e una forma morbida si stacca meglio. */
export const RADIUS = { lg: 26, md: 18, sm: 12 };

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
