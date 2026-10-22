import { Easing } from 'react-native-reanimated';

/**
 * La curva con cui le cose arrivano: svelta all'inizio, si posa piano alla
 * fine. La usano i fogli che salgono, la pastiglia delle sezioni e le barre
 * del sondaggio. Con «Rimuovi animazioni» attivo nel telefono Reanimated
 * salta le animazioni da sé.
 */
export const DECELERA = Easing.bezier(0.16, 1, 0.3, 1);
