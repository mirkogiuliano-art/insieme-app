import { createContext, useContext } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

/**
 * Quanto spazio occupa, dal fondo, la barra delle sezioni di un gruppo.
 *
 * La barra galleggia sopra il contenuto invece di stargli sotto: le liste
 * le scorrono dietro fino al bordo dello schermo. Ogni sezione però deve
 * sapere quanto lasciare libero in fondo, perché l'ultimo link, il campo di
 * scrittura o la scheda di un posto non finiscano nascosti dietro di lei.
 * Vale 0 quando la barra non c'è (tastiera aperta).
 */
export const TabBarSpaceContext = createContext(0);

export function useTabBarSpace() {
  return useContext(TabBarSpaceContext);
}

/** Lo spazio che la barra occupa dal fondo: 12 di margine, 58 di barra
 * (6 + 46 + 6) e 10 di respiro fra lei e quello che le sta sopra. */
export const TABBAR_SPACE = 80;

/**
 * Lo spazio della barra, che si chiude **insieme** alla tastiera.
 *
 * Il sì/no «tastiera aperta» scatta in un colpo solo, all'inizio, mentre il
 * contenuto sale gradualmente con la tastiera. Togliere gli 80 punti di
 * colpo faceva scendere il campo della chat nel primo fotogramma e poi
 * risalire: lo sfarfallio all'apertura. Qui lo spazio si restringe man
 * mano che la tastiera sale (`progress` va da 0 a 1), e il campo fa un
 * movimento solo, verso l'alto.
 */
export function useSpazioBarraAnimato() {
  const { progress } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({ height: TABBAR_SPACE * (1 - progress.value) }));
}

/** La barra stessa si dissolve e scende un poco mentre la tastiera sale,
 * invece di sparire di colpo nel primo fotogramma. */
export function useBarraAnimata() {
  const { progress } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: progress.value * 24 }],
  }));
}
